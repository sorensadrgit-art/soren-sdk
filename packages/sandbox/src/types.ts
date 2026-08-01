import type { Digest } from "@soren-sdk/contracts";

/**
 * Sandbox policy: strict controls for an isolated apply sandbox.
 * Mirrors `schemas/sandbox-policy.schema.json`.
 */
export interface SandboxPolicy {
  schemaVersion: "1.0.0-draft.1";
  contractKind: "sandbox-policy";
  policyId: string;
  allowAbsolutePaths: boolean;
  allowSymlinkEscapes: boolean;
  allowSpecialFiles: boolean;
  allowCommands: boolean;
  allowNetwork: boolean;
  maxFiles: number;
  maxBytes: number;
  maxOperations: number;
  maxDurationSeconds: number;
  writableRoots: string[];
  denyPaths: string[];
}

/**
 * A single file system entry inside a sandbox.
 */
export interface SandboxEntry {
  path: string;
  type: "directory" | "file" | "symlink" | "unknown";
  size: number;
  digest: Digest | null;
}

/**
 * Deterministic content-addressed snapshot of a sandbox tree.
 * `entries` is sorted by path for deterministic ordering.
 */
export interface SandboxSnapshot {
  root: string;
  entries: SandboxEntry[];
  digest: Digest;
}

/**
 * Request to create an isolated sandbox session.
 */
export interface CreateSandboxRequest {
  policy: SandboxPolicy;
  root: string;
  sandboxId: string;
  seed?: Record<string, Uint8Array>;
  allowRun?: boolean;
}

/**
 * Runtime enforcement result for a single sandbox mutation.
 */
export interface SandboxMutationResult {
  blocked: boolean;
  reasons: string[];
  operationCount: number;
  bytesWritten: number;
  filesPresent: number;
}

/**
 * Injectable clock so deterministic fakes control time.
 */
export interface Clock {
  now(): number;
}

/**
 * Isolated mutation boundary. Operations are strictly path-checked and
 * resource-limited. `run` is intentionally absent from the production
 * adapters; an optional guarded variant exists for future review.
 */
export interface SandboxSession {
  readonly id: string;
  readonly root: string;
  readonly policy: SandboxPolicy;
  read(path: string): Promise<Uint8Array>;
  write(path: string, content: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  list(path: string): Promise<SandboxEntry[]>;
  snapshot(): Promise<SandboxSnapshot>;
  close(): Promise<void>;
}

/**
 * Provider-neutral sandbox factory.
 */
export interface SandboxProvider {
  create(request: CreateSandboxRequest): Promise<SandboxSession>;
}

/**
 * Error thrown when a sandbox rejects an operation.
 */
export class SandboxError extends Error {
  readonly code:
    | "SANDBOX_ABSOLUTE_PATH"
    | "SANDBOX_CLOSED"
    | "SANDBOX_PATH_TRAVERSAL"
    | "SANDBOX_NUL_BYTE"
    | "SANDBOX_SYMLINK_ESCAPE"
    | "SANDBOX_SPECIAL_FILE"
    | "SANDBOX_LIMIT_EXCEEDED"
    | "SANDBOX_NOT_FOUND"
    | "SANDBOX_INVALID_ENCODING"
    | "SANDBOX_OPERATION_DENIED";

  constructor(
    code: SandboxError["code"],
    message: string,
    readonly details?: Record<string, string | number | boolean>
  ) {
    super(message);
    this.name = "SandboxError";
    this.code = code;
  }
}

/**
 * VCS isolation state.
 */
export interface VcsState {
  detected: boolean;
  root: string | null;
  branch: string | null;
  commit: string | null;
  dirty: boolean;
  protectedBranch: boolean;
  reasons: string[];
}

/**
 * Request to create an isolated workspace for apply.
 */
export interface IsolatedWorkspaceRequest {
  sourceRoot: string;
  workspaceId: string;
  branch: string | null;
}

/**
 * An isolated workspace created from a source tree.
 */
export interface IsolatedWorkspace {
  workspaceId: string;
  location: string;
  createdFrom: string;
  clean: boolean;
  closed: boolean;
  close(): Promise<void>;
}

/**
 * VCS isolation provider port for Phase 9.
 */
export interface VcsIsolationProvider {
  inspect(root: string): Promise<VcsState>;
  createIsolatedWorkspace(
    request: IsolatedWorkspaceRequest
  ): Promise<IsolatedWorkspace>;
}