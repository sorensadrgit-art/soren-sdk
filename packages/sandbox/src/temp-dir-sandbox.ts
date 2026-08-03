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
    assertNoNulOrEncodingIssues(candidate);
    const safe = assertSafeRelativeSync(candidate);
    assertPathAllowed(safe, this.policy.writableRoots, this.policy.denyPaths);
    // Re-resolve real path and recheck containment before every mutation.
    const resolved = await resolveWithinRoot(safe, this.root, {
      allowAbsolutePaths: this.policy.allowAbsolutePaths,
      denyPaths: this.policy.denyPaths
    });
    await assertRegularFileOrDirectory(resolved, {
      allowSpecialFiles: this.policy.allowSpecialFiles,
      allowSymlinkEscapes: this.policy.allowSymlinkEscapes
    });
    return resolved;
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

    const resolved = await this.resolveCandidate(p);
    const parent = path.dirname(resolved);
    await fsp.mkdir(parent, { recursive: true });

    const existing = await this.exists(resolved);
    if (!existing) {
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
      await fsp.rename(tempPath, resolved);
    } catch (error) {
      await fsp.rm(tempPath, { force: true }).catch(() => undefined);
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
    const resolved = await this.resolveCandidate(p);
    const stat = await fsp.stat(resolved).catch(() => null);
    if (stat === null) {
      throw new SandboxError("SANDBOX_NOT_FOUND", `Not found: ${p}`, { path: p });
    }
    if (stat.isDirectory()) {
      const children = await fsp.readdir(resolved).catch(() => []);
      if (children.length > 0) {
        throw new SandboxError(
          "SANDBOX_OPERATION_DENIED",
          "Directory must be empty to remove.",
          { path: p }
        );
      }
      await fsp.rmdir(resolved);
    } else {
      await fsp.rm(resolved, { force: false });
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

  private async exists(target: string): Promise<boolean> {
    try {
      await fsp.stat(target);
      return true;
    } catch {
      return false;
    }
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