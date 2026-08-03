# Apply Sandbox

## 1. Purpose

`packages/apply` and `packages/sandbox` implement the isolated mutation
boundary for Soren SDK. An apply run mutates only an explicitly approved,
immutable execution plan, inside a sandbox that enforces strict path,
symlink, special-file, and resource controls, with before/after snapshots,
diff, rollback records, cancellation, and audit evidence.

The original project tree remains untouched by default. Apply is a separate,
explicit, high-risk surface. It is **disabled** for public exposure in
Phase 9 (`APPLY_DISABLED`). Disabled adapters must return `APPLY_DISABLED`
until the coordinator approves exposure after review.

## 2. Scope of Phase 9

Implemented:

- Approval validation (integrity, expiration, one-time use)
- Plan / project / policy drift checks
- Sandbox and executor interfaces with deterministic fakes
- Temporary-directory and in-memory test sandboxes
- Strict path and resource controls
- Before/after snapshots and deterministic diff
- Rollback records and reverse rollback with verification
- Apply orchestration and cancellation
- Crash-state recovery records
- Structured audit/evidence output through an evidence-sink port

Not implemented in Phase 9 (future phases, after review):

- Unrestricted host command execution
- Network access
- Package installation
- Git mutation, deployment, or publishing
- Public CLI / REST / MCP apply exposure

## 3. Interfaces

### `ApplyService`

```ts
interface ApplyService {
  prepare(input: PrepareApplyInput): ApplyPreparation;
  apply(input: ApplyApprovedPlanInput): Promise<ApplyResult>;
  rollback(input: RollbackInput): Promise<RollbackResult>;
  cancel(runId: string): Promise<void>;
}
```

### `SandboxProvider` / `SandboxSession`

```ts
interface SandboxProvider {
  create(request: CreateSandboxRequest): Promise<SandboxSession>;
}

interface SandboxSession {
  read(path: string): Promise<Uint8Array>;
  write(path: string, content: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  list(path: string): Promise<SandboxEntry[]>;
  snapshot(): Promise<SandboxSnapshot>;
  close(): Promise<void>;
}
```

The `run` method is intentionally absent from the production adapters.
Command execution is disabled in Phase 9. An optional guarded `run` may be
proposed in a future phase only through the coordination review process.

### Parallel integration ports

```ts
interface ApprovedPlanProvider {}
interface ApplyEvidenceSink {}
interface ResolvedPolicyProvider {}
interface ProjectSnapshotProvider {}
interface SandboxPolicyProvider {}
```

All ports have in-memory fakes in `packages/apply/src/ports-fakes.ts`.
Future mappings are documented in `docs/INTEGRATION-NOTES.md`.

## 4. Pre-apply hard gates

Immediately before the first mutation, the service verifies:

| Gate | Failure mode |
| --- | --- |
| Approval contract and integrity digest | `approval.integrity` failed |
| Approval expiration | `approval.expiration` failed |
| Approval one-time nonce | `approval.one-time` failed |
| Exact plan ID and digest | `drift.plan` failed |
| Exact project snapshot ID | `drift.project` failed |
| Exact policy snapshot digest | `drift.policy` failed |
| Allowed operations and paths | per-operation gates failed |
| Commands / network disabled | `execution.denied` failed |
| No protected branch / workspace | `vcs.isolation` failed |
| Approval limits within sandbox policy | `limits.within-policy` failed |
| Rollback capability | always recorded as capable |

Any gate failure blocks the run before any file is written
(`ready: false`).

## 5. Filesystem safety

Both sandbox implementations enforce:

- NUL-byte and invalid-encoding rejection
- Path normalization (backslashes to forward slashes)
- Absolute-path rejection unless the sandbox contract explicitly permits
  (`allowAbsolutePaths`, default `false`)
- `..` and traversal rejection
- Real-path resolution and recheck before every mutation (closes symlink
  TOCTOU races)
- Symlink-escape rejection (`allowSymlinkEscapes`, default `false`)
- Device / socket / FIFO / special-file rejection
  (`allowSpecialFiles`, default `false`)
- File-count, byte, operation, and time limits
- Atomic writes (temp file + rename) in the temp-dir sandbox
- Before-state digests for rollback

## 6. Allowed operations

Only operations explicitly present in the immutable plan are permitted:

- Create file
- Replace file
- Delete file
- Create directory (schemas reserve the name; orchestration uses file ops)
- Remove empty directory (schemas reserve the name; orchestration uses file ops)

No arbitrary callbacks, commands, package installation, network access, Git
mutation, deployment, or publishing.

## 7. Public exposure

Apply is not exposed through CLI, REST, or MCP in this PR. The default
service rejects any use with `APPLY_DISABLED`. Adapters that build on the
service must gate on the `APPLY_DISABLED` constant until the coordinator
approves exposure after independent security review.