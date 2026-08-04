import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import {
  assertNoNulOrEncodingIssues,
  assertPathAllowed,
  assertRegularFileOrDirectory,
  assertSafeRelativeSync,
  fileDigest,
  resolveWithinRoot
} from "./path-safety.js";
import { buildSnapshot } from "./snapshot.js";
import { SystemClock } from "./clock.js";
import {
  SandboxError,
  type Clock,
  type CreateSandboxRequest,
  type SandboxEntry,
  type SandboxPolicy,
  type SandboxProvider,
  type SandboxSession,
  type SandboxSnapshot
} from "./types.js";

interface MutationEntryIdentity {
  dev: number | bigint;
  ino: number | bigint;
  mode: number | bigint;
}

interface ValidatedMutationTarget {
  relativePath: string;
  absolutePath: string;
  resolvedPath: string;
  entryIdentity: MutationEntryIdentity | null;
}

/**
 * Temporary-directory sandbox. Enforces strict path, symlink, special-file,
 * and resource controls before every mutation. The original host tree is
 * never touched: operations resolve only inside the sandbox root. The `run`
 * method is intentionally absent; command execution is disabled in this
 * production adapter.
 */
export class TempDirSandboxSession implements SandboxSession {
  readonly id: string;
  readonly root: string;
  readonly policy: SandboxPolicy;
  readonly #clock: Clock;
  #closed = false;
  #operations = 0;
  #bytes = 0;
  #startedAt: number;

  constructor(id: string, root: string, policy: SandboxPolicy, clock: Clock) {
    this.id = id;
    this.root = root;
    this.policy = policy;
    this.#clock = clock;
    this.#startedAt = clock.now();
  }

  private assertOpen(): void {
    if (this.#closed) {
      throw new SandboxError("SANDBOX_CLOSED", `Sandbox ${this.id} is closed.`);
    }
  }

  private assertTimeBudget(): void {
    const elapsedSeconds = (this.#clock.now() - this.#startedAt) / 1000;
    if (elapsedSeconds > this.policy.maxDurationSeconds) {
      throw new SandboxError(
        "SANDBOX_LIMIT_EXCEEDED",
        `Sandbox ${this.id} exceeded its time limit of ${this.policy.maxDurationSeconds}s.`,
        { elapsedSeconds: Math.floor(elapsedSeconds) }
      );
    }
  }

  private async resolveCandidate(candidate: string): Promise<string> {
    return (await this.resolveMutationTarget(candidate)).absolutePath;
  }

  private async resolveMutationTarget(candidate: string): Promise<ValidatedMutationTarget> {
    assertNoNulOrEncodingIssues(candidate);
    const safe = assertSafeRelativeSync(candidate);
    assertPathAllowed(safe, this.policy.writableRoots, this.policy.denyPaths);
    const absolutePath = path.resolve(this.root, ...safe.split("/").filter(Boolean));
    const resolvedPath = await resolveWithinRoot(safe, this.root, {
      allowAbsolutePaths: this.policy.allowAbsolutePaths,
      denyPaths: this.policy.denyPaths
    });
    await this.assertSafeEntryChain(absolutePath);
    const entry = await this.lstatIfExists(absolutePath);
    return {
      relativePath: safe,
      absolutePath,
      resolvedPath,
      entryIdentity: entry === null ? null : this.entryIdentity(entry)
    };
  }

  private async revalidateMutationTarget(
    original: ValidatedMutationTarget
  ): Promise<ValidatedMutationTarget> {
    const current = await this.resolveMutationTarget(original.relativePath);
    if (
      current.resolvedPath !== original.resolvedPath ||
      !this.sameEntryIdentity(current.entryIdentity, original.entryIdentity)
    ) {
      throw new SandboxError(
        "SANDBOX_OPERATION_DENIED",
        "Mutation target changed after authorization.",
        { path: original.relativePath }
      );
    }
    return current;
  }

  private async assertSafeEntryChain(target: string): Promise<void> {
    const root = path.resolve(this.root);
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new SandboxError("SANDBOX_PATH_TRAVERSAL", "Sandbox path containment check failed.");
    }

    const rootEntry = await this.lstatIfExists(root);
    if (rootEntry === null || !rootEntry.isDirectory()) {
      throw new SandboxError("SANDBOX_OPERATION_DENIED", "Sandbox root is not an accessible directory.");
    }
    await assertRegularFileOrDirectory(root, {
      allowSpecialFiles: this.policy.allowSpecialFiles,
      allowSymlinkEscapes: this.policy.allowSymlinkEscapes
    });

    let current = root;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      const entry = await this.lstatIfExists(current);
      if (entry === null) return;
      await assertRegularFileOrDirectory(current, {
        allowSpecialFiles: this.policy.allowSpecialFiles,
        allowSymlinkEscapes: this.policy.allowSymlinkEscapes
      });
      if (current !== target && !entry.isDirectory()) {
        throw new SandboxError("SANDBOX_OPERATION_DENIED", "Sandbox path ancestor is not a directory.");
      }
    }
  }

  private async lstatIfExists(target: string): Promise<Awaited<ReturnType<typeof fsp.lstat>> | null> {
    try {
      return await fsp.lstat(target);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  private entryIdentity(entry: Awaited<ReturnType<typeof fsp.lstat>>): MutationEntryIdentity {
    return { dev: entry.dev, ino: entry.ino, mode: entry.mode };
  }

  private sameEntryIdentity(
    left: MutationEntryIdentity | null,
    right: MutationEntryIdentity | null
  ): boolean {
    return (
      left?.dev === right?.dev &&
      left?.ino === right?.ino &&
      left?.mode === right?.mode
    );
  }

  async read(p: string): Promise<Uint8Array> {
    this.assertOpen();
    const resolved = await this.resolveCandidate(p);
    try {
      return await fsp.readFile(resolved);
    } catch {
      throw new SandboxError("SANDBOX_NOT_FOUND", `Not found: ${p}`, { path: p });
    }
  }

  async write(p: string, content: Uint8Array): Promise<void> {
    this.assertOpen();
    this.assertTimeBudget();
    this.#operations += 1;
    if (this.#operations > this.policy.maxOperations) {
      throw new SandboxError(
        "SANDBOX_LIMIT_EXCEEDED",
        `Sandbox ${this.id} exceeded operation limit of ${this.policy.maxOperations}.`,
        { operations: this.#operations }
      );
    }
    this.#bytes += content.byteLength;
    if (this.#bytes > this.policy.maxBytes) {
      throw new SandboxError(
        "SANDBOX_LIMIT_EXCEEDED",
        `Sandbox ${this.id} exceeded byte limit of ${this.policy.maxBytes}.`,
        { bytes: this.#bytes }
      );
    }

    const target = await this.resolveMutationTarget(p);
    const parent = path.dirname(target.absolutePath);
    await fsp.mkdir(parent, { recursive: true });
    const targetBeforeWrite = await this.revalidateMutationTarget(target);

    if (targetBeforeWrite.entryIdentity === null) {
      const fileCount = await this.countFiles();
      if (fileCount >= this.policy.maxFiles) {
        throw new SandboxError(
          "SANDBOX_LIMIT_EXCEEDED",
          `Sandbox ${this.id} exceeded file limit of ${this.policy.maxFiles}.`,
          { files: fileCount }
        );
      }
    }

    // Atomic write: write to a temp sibling then rename over the target.
    const tempName = `.soren-sdk-tmp-${this.id}-${this.#operations}`;
    const tempPath = path.join(parent, tempName);
    try {
      await fsp.writeFile(tempPath, content, { flag: "wx" });
      const targetBeforeRename = await this.revalidateMutationTarget(target);
      await fsp.rename(tempPath, targetBeforeRename.absolutePath);
    } catch (error) {
      await fsp.rm(tempPath, { force: true });
      throw error;
    }
  }

  async remove(p: string): Promise<void> {
    this.assertOpen();
    this.assertTimeBudget();
    this.#operations += 1;
    if (this.#operations > this.policy.maxOperations) {
      throw new SandboxError(
        "SANDBOX_LIMIT_EXCEEDED",
        `Sandbox ${this.id} exceeded operation limit of ${this.policy.maxOperations}.`,
        { operations: this.#operations }
      );
    }
    const target = await this.resolveMutationTarget(p);
    const stat = await this.lstatIfExists(target.absolutePath);
    if (stat === null) {
      throw new SandboxError("SANDBOX_NOT_FOUND", `Not found: ${p}`, { path: p });
    }
    if (stat.isDirectory()) {
      const children = await fsp.readdir(target.absolutePath);
      if (children.length > 0) {
        throw new SandboxError(
          "SANDBOX_OPERATION_DENIED",
          "Directory must be empty to remove.",
          { path: p }
        );
      }
      const targetBeforeRemove = await this.revalidateMutationTarget(target);
      await fsp.rmdir(targetBeforeRemove.absolutePath);
    } else {
      const targetBeforeRemove = await this.revalidateMutationTarget(target);
      await fsp.rm(targetBeforeRemove.absolutePath, { force: false });
    }
  }

  async list(p: string): Promise<SandboxEntry[]> {
    this.assertOpen();
    const resolved = await this.resolveCandidate(p);
    const names = await fsp.readdir(resolved).catch(() => []);
    const entries: SandboxEntry[] = [];
    for (const name of names.sort((left, right) => left.localeCompare(right))) {
      const absolute = path.join(resolved, name);
      const relative = path.relative(this.root, absolute);
      const stat = await fsp.stat(absolute).catch(() => null);
      if (stat === null) continue;
      if (stat.isDirectory()) {
        entries.push({ path: relative, type: "directory", size: 0, digest: null });
      } else if (stat.isFile()) {
        const content = await fsp.readFile(absolute).catch(() => null);
        entries.push({
          path: relative,
          type: "file",
          size: stat.size,
          digest: content === null ? null : fileDigest(content)
        });
      } else if (stat.isSymbolicLink()) {
        entries.push({ path: relative, type: "symlink", size: 0, digest: null });
      } else {
        entries.push({ path: relative, type: "unknown", size: stat.size, digest: null });
      }
    }
    return entries;
  }

  async snapshot(): Promise<SandboxSnapshot> {
    this.assertOpen();
    return buildSnapshot(this.root);
  }

  async close(): Promise<void> {
    this.#closed = true;
  }


  private async countFiles(): Promise<number> {
    const snapshot = await buildSnapshot(this.root);
    return snapshot.entries.filter((entry) => entry.type === "file").length;
  }
}

/**
 * Provider that creates temp-dir sandbox sessions. Seeds are written through
 * the session's public `write` method so seed data passes the same strict
 * path and resource checks as all other mutations.
 */
export class TempDirSandboxProvider implements SandboxProvider {
  readonly #clock: Clock;
  readonly #baseDir: string;

  constructor(
    clock: Clock = new SystemClock(),
    baseDir: string = path.join(os.tmpdir(), "soren-sdk-sandboxes")
  ) {
    this.#clock = clock;
    this.#baseDir = baseDir;
  }

  async create(request: CreateSandboxRequest): Promise<SandboxSession> {
    const root = path.join(this.#baseDir, request.sandboxId);
    await fsp.mkdir(root, { recursive: true });
    const session = new TempDirSandboxSession(
      request.sandboxId,
      root,
      request.policy,
      this.#clock
    );
    if (request.seed !== undefined) {
      for (const [relativePath, content] of Object.entries(request.seed)) {
        await session.write(relativePath, content);
      }
    }
    return session;
  }
}