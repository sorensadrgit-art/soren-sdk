import type { Digest, ExecutionPlan, ProjectSnapshot } from "@soren-sdk/contracts";
import type { SandboxPolicy, VcsState } from "@soren-sdk/sandbox";

/**
 * Allowed apply operation types. Only operations explicitly present in the
 * immutable plan are permitted.
 */
export type ApplyOperation =
  | "create-file"
  | "replace-file"
  | "delete-file"
  | "create-directory"
  | "remove-empty-directory";

/**
 * Apply approval contract. Mirrors `schemas/apply-approval.schema.json`.
 * Never stores credentials.
 */
export interface ApplyApproval {
  schemaVersion: "1.0.0-draft.1";
  contractKind: "apply-approval";
  approvalId: string;
  executionPlanId: string;
  executionPlanDigest: Digest;
  projectSnapshotId: Digest;
  policySnapshotId: Digest;
  allowedOperations: ApplyOperation[];
  allowedPaths: string[];
  allowedCommandIds: string[];
  allowedNetworkHosts: string[];
  limits: {
    maxFiles: number;
    maxBytes: number;
    maxOperations: number;
    maxDurationSeconds: number;
  };
  expiresAt: string;
  approver: {
    id: string;
    kind: "agent" | "service" | "user";
  };
  nonce: string;
  integrityDigest: Digest;
}

/**
 * Input to `prepare`.
 */
export interface PrepareApplyInput {
  executionPlan: ExecutionPlan;
  approval: ApplyApproval;
  projectSnapshot: ProjectSnapshot;
  policySnapshot: { policyId: string; digest: Digest };
  sandboxPolicy: SandboxPolicy;
  vcsState: VcsState;
}

/**
 * Result of `prepare`: a validated, ready-to-apply preparation.
 */
export interface ApplyPreparation {
  runId: string;
  preparedAt: string;
  executionPlanId: string;
  executionPlanDigest: Digest;
  projectSnapshotId: Digest;
  policySnapshotId: Digest;
  sandboxPolicyId: string;
  vcsState: VcsState;
  approvalNonce: string;
  gates: Array<{
    code: string;
    status: "passed" | "failed";
    message: string;
  }>;
  operations: Array<{
    index: number;
    operation: ApplyOperation;
    path: string;
    contentDigest: Digest | null;
  }>;
  ready: boolean;
}

/**
 * Input to `apply`.
 */
export interface ApplyApprovedPlanInput {
  preparation: ApplyPreparation;
  sandboxId: string;
  contentProvider: (path: string) => Promise<Uint8Array>;
}

/**
 * A single operation event recorded during apply.
 */
export interface ApplyOperationEvent {
  index: number;
  path: string;
  operation: ApplyOperation;
  status: "applied" | "blocked" | "failed" | "skipped";
}

/**
 * A rollback record entry.
 */
export interface RollbackRecordEntry {
  operationIndex: number;
  path: string;
  reverted: boolean;
  verified: boolean;
  error: string | null;
}

/**
 * Diff entry between before and after snapshots.
 */
export interface ApplyDiffEntry {
  path: string;
  kind: "created" | "modified" | "removed";
  beforeDigest: Digest | null;
  afterDigest: Digest | null;
  operation: string;
}

/**
 * Audit evidence event.
 */
export interface ApplyEvidenceEvent {
  kind: string;
  recordedAt: string;
  runId: string;
  redacted: boolean;
  detail?: Record<string, unknown>;
}

/**
 * Result of an apply run.
 */
export interface ApplyResult {
  schemaVersion: "1.0.0-draft.1";
  contractKind: "apply-result";
  runId: string;
  status: "applied" | "cancelled" | "failed" | "not-started" | "rolled-back" | "rollback-failed";
  startedAt: string;
  completedAt: string;
  executionPlanId: string;
  executionPlanDigest: Digest;
  sandboxId: string;
  beforeSnapshotDigest: Digest;
  afterSnapshotDigest: Digest | null;
  diff: ApplyDiffEntry[];
  rollback: RollbackRecordEntry[];
  operations: ApplyOperationEvent[];
  cancelled: boolean;
  recoverable: boolean;
  errors: string[];
  evidence: ApplyEvidenceEvent[];
}

/**
 * Input to `rollback`.
 */
export interface RollbackInput {
  runId: string;
  sandboxId: string;
  rollbackRecords: RollbackRecordEntry[];
  beforeSnapshotDigest: Digest;
}

/**
 * Result of a rollback.
 */
export interface RollbackResult {
  runId: string;
  status: "rolled-back" | "rollback-failed" | "not-needed";
  reverted: number;
  verified: number;
  failed: number;
  errors: string[];
  verifiedDigest: string | null;
}

/**
 * Apply service: the isolated mutation boundary.
 */
export interface ApplyService {
  prepare(input: PrepareApplyInput): ApplyPreparation;
  apply(input: ApplyApprovedPlanInput): Promise<ApplyResult>;
  rollback(input: RollbackInput): Promise<RollbackResult>;
  cancel(runId: string): Promise<void>;
}

/**
 * Error thrown by the apply service.
 */
export class ApplyError extends Error {
  readonly code:
    | "APPLY_APPROVAL_EXPIRED"
    | "APPLY_APPROVAL_MISSING"
    | "APPLY_APPROVAL_REPLAYED"
    | "APPLY_APPROVAL_DIGEST_MISMATCH"
    | "APPLY_APPROVAL_OPERATION_DENIED"
    | "APPLY_APPROVAL_PATH_DENIED"
    | "APPLY_APPROVAL_COMMAND_DENIED"
    | "APPLY_APPROVAL_NETWORK_DENIED"
    | "APPLY_APPROVAL_LIMIT_EXCEEDED"
    | "APPLY_RESOURCE_LIMIT"
    | "APPLY_DRIFT_PLAN"
    | "APPLY_DRIFT_PROJECT"
    | "APPLY_DRIFT_POLICY"
    | "APPLY_NOT_READY"
    | "APPLY_DISABLED"
    | "APPLY_PREPARATION_INVALID"
    | "APPLY_ROLLBACK_FAILED"
    | "APPLY_CANCELLED"
    | "APPLY_CRASH_STATE"
    | "APPLY_INPUT_INVALID";

  constructor(
    code: ApplyError["code"],
    message: string,
    readonly details?: Record<string, string | number | boolean>
  ) {
    super(message);
    this.name = "ApplyError";
    this.code = code;
  }
}

/**
 * Crash-state recovery record.
 */
export interface CrashStateRecord {
  runId: string;
  sandboxId: string;
  executionPlanId: string;
  executionPlanDigest: Digest;
  startedAt: string;
  lastOperationIndex: number;
  operationsApplied: number;
  rollbackRecords: RollbackRecordEntry[];
  beforeSnapshotDigest: Digest;
  recoverable: boolean;
  recordedAt: string;
}