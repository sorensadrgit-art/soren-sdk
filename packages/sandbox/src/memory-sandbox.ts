import { digestJson } from "@soren-sdk/contracts";

import { fileDigest, assertSafeRelativeSync } from "./path-safety.js";
import type {
  Clock,
  CreateSandboxRequest,
  SandboxEntry,
  SandboxPolicy,
  SandboxSession,
  SandboxSnapshot
} from "./types.js";
import { SandboxError } from "./types.js";
import { FakeClock } from "./clock.js";

interface MemoryEntry {
  kind: "directory" | "file";
  content: Uint8Array | null;
}

/**
 * In-memory sandbox used for deterministic tests and as a reference
 * implementation. Enforces the same strict path and resource controls as the
 * temporary-directory sandbox. Never touches the host filesystem.
 */
export class MemorySandboxSession implements SandboxSession {
  readonly id: string;
  readonly root: string;
  readonly policy: SandboxPolicy;
  readonly #clock: Clock;
  #closed = false;
  #operations = 0;
  #bytes = 0;
  #startedAt: number;
  readonly #tree = new Map<string, MemoryEntry>();

  constructor(
    id: string,
    root: string,
    policy: SandboxPolicy,
    seed: Record<string, Uint8Array> | undefined,
    clock: Clock
  ) {
    this.id = id;
    this.root = root;
    this.policy = policy;
    this.#clock = clock;
    this.#startedAt = clock.now();
    this.#tree.set("", { kind: "directory", content: null });
    for (const [relativePath, content] of Object.entries(seed ?? {})) {
      this.#writeInternal(relativePath, content, true);
    }
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

  private normalize(p: string): string {
    assertSafeRelativeSync(p);
    if (p === "." || p === "./") return "";
    return p.replace(/^\.\//u, "").replace(/\/$/u, "");
  }

  private assertWritable(p: string): void {
    const allowed = this.policy.writableRoots.some(
      (rootPath) =>
        p === rootPath || p.startsWith(`${rootPath}/`) || rootPath === "."
    );
    if (!allowed) {
      throw new SandboxError("SANDBOX_OPERATION_DENIED", `Path outside writable roots: ${p}`, {
        path: p
      });
    }
    for (const deny of this.policy.denyPaths) {
      if (p === deny || p.startsWith(`${deny}/`)) {
        throw new SandboxError("SANDBOX_OPERATION_DENIED", `Path denied by policy: ${p}`, {
          path: p
        });
      }
    }
  }

  private parentEntries(p: string): string[] {
    if (p === "") return [];
    const segments = p.split("/");
    const parents: string[] = [];
    let current = "";
    for (const segment of segments.slice(0, -1)) {
      current = current === "" ? segment : `${current}/${segment}`;
      parents.push(current);
    }
    return parents;
  }

  private ensureParents(p: string): void {
    for (const parent of this.parentEntries(p)) {
      const entry = this.#tree.get(parent);
      if (entry === undefined) {
        this.#tree.set(parent, { kind: "directory", content: null });
      } else if (entry.kind !== "directory") {
        throw new SandboxError(
          "SANDBOX_OPERATION_DENIED",
          `Parent is not a directory: ${parent}`,
          { path: parent }
        );
      }
    }
  }

  #writeInternal(p: string, content: Uint8Array, seed: boolean): void {
    const normalized = this.normalize(p);
    this.assertWritable(normalized);
    this.ensureParents(normalized);
    if (!seed) {
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
    }
    const currentFiles = this.#countFiles();
    if (this.#tree.has(normalized) === false && currentFiles >= this.policy.maxFiles) {
      throw new SandboxError(
        "SANDBOX_LIMIT_EXCEEDED",
        `Sandbox ${this.id} exceeded file limit of ${this.policy.maxFiles}.`,
        { files: currentFiles }
      );
    }
    this.#tree.set(normalized, { kind: "file", content: new Uint8Array(content) });
  }

  #countFiles(): number {
    let count = 0;
    for (const entry of this.#tree.values()) {
      if (entry.kind === "file") count += 1;
    }
    return count;
  }

  async read(p: string): Promise<Uint8Array> {
    this.assertOpen();
    const normalized = this.normalize(p);
    const entry = this.#tree.get(normalized);
    if (entry === undefined || entry.kind !== "file" || entry.content === null) {
      throw new SandboxError("SANDBOX_NOT_FOUND", `Not found: ${p}`, { path: p });
    }
    return new Uint8Array(entry.content);
  }

  async write(p: string, content: Uint8Array): Promise<void> {
    this.#writeInternal(p, content, false);
  }

  async remove(p: string): Promise<void> {
    this.assertOpen();
    this.assertTimeBudget();
    const normalized = this.normalize(p);
    if (normalized === "") {
      throw new SandboxError("SANDBOX_OPERATION_DENIED", "Cannot remove sandbox root.", {
        path: p
      });
    }
    const entry = this.#tree.get(normalized);
    if (entry === undefined) {
      throw new SandboxError("SANDBOX_NOT_FOUND", `Not found: ${p}`, { path: p });
    }
    if (entry.kind === "directory") {
      for (const key of this.#tree.keys()) {
        if (key !== normalized && key.startsWith(`${normalized}/`)) {
          throw new SandboxError(
            "SANDBOX_OPERATION_DENIED",
            "Directory must be empty to remove.",
            { path: p }
          );
        }
      }
    }
    this.#tree.delete(normalized);
    this.#operations += 1;
    if (this.#operations > this.policy.maxOperations) {
      throw new SandboxError(
        "SANDBOX_LIMIT_EXCEEDED",
        `Sandbox ${this.id} exceeded operation limit of ${this.policy.maxOperations}.`,
        { operations: this.#operations }
      );
    }
  }

  async list(p: string): Promise<SandboxEntry[]> {
    this.assertOpen();
    const normalized = this.normalize(p);
    const prefix = normalized === "" ? "" : `${normalized}/`;
    const entries: SandboxEntry[] = [];
    for (const [key, entry] of this.#tree) {
      if (key.startsWith(prefix) && key !== normalized && !key.slice(prefix.length).includes("/")) {
        if (entry.kind === "directory") {
          entries.push({ path: key, type: "directory", size: 0, digest: null });
        } else {
          const content = entry.content ?? new Uint8Array();
          entries.push({
            path: key,
            type: "file",
            size: content.byteLength,
            digest: fileDigest(content)
          });
        }
      }
    }
    return entries.sort((left, right) => left.path.localeCompare(right.path));
  }

  async snapshot(): Promise<SandboxSnapshot> {
    this.assertOpen();
    const entries: SandboxEntry[] = [];
    for (const [key, entry] of this.#tree) {
      if (entry.kind === "directory") {
        entries.push({ path: key === "" ? "." : key, type: "directory", size: 0, digest: null });
      } else {
        const content = entry.content ?? new Uint8Array();
        entries.push({
          path: key === "" ? "." : key,
          type: "file",
          size: content.byteLength,
          digest: fileDigest(content)
        });
      }
    }
    entries.sort((left, right) => left.path.localeCompare(right.path));
    const digest = digestJson({
      root: this.root,
      entries: entries.map((entry) => ({
        path: entry.path,
        type: entry.type,
        size: entry.size,
        digest: entry.digest
      }))
    });
    return { root: this.root, entries, digest };
  }

  async close(): Promise<void> {
    this.#closed = true;
  }
}

/**
 * Provider that creates in-memory sandbox sessions.
 */
export class MemorySandboxProvider implements SandboxProviderLike {
  readonly #clock: Clock;

  constructor(clock: Clock = new FakeClock()) {
    this.#clock = clock;
  }

  async create(request: CreateSandboxRequest): Promise<SandboxSession> {
    return new MemorySandboxSession(
      request.sandboxId,
      request.root,
      request.policy,
      request.seed,
      this.#clock
    );
  }
}

// Local interface alias to avoid a circular import with types.ts.
import type { SandboxProvider as SandboxProviderLike } from "./types.js";