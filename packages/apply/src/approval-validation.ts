import { digestJson, type JsonValue } from "@soren-sdk/contracts";

import type { ApplyApproval, ApplyOperation } from "./types.js";
import { ApplyError } from "./types.js";

/**
 * Compute the integrity digest of an approval. The digest covers all binding
 * fields except `integrityDigest` itself. This is the one-time-use binding
 * that prevents replay and tampering.
 */
export function approvalIntegrityPayload(approval: ApplyApproval): Record<string, unknown> {
  return {
    approvalId: approval.approvalId,
    executionPlanId: approval.executionPlanId,
    executionPlanDigest: approval.executionPlanDigest,
    projectSnapshotId: approval.projectSnapshotId,
    policySnapshotId: approval.policySnapshotId,
    allowedOperations: [...approval.allowedOperations].sort(),
    allowedPaths: [...approval.allowedPaths].sort(),
    allowedCommandIds: [...approval.allowedCommandIds].sort(),
    allowedNetworkHosts: [...approval.allowedNetworkHosts].sort(),
    limits: approval.limits,
    expiresAt: approval.expiresAt,
    approver: approval.approver,
    nonce: approval.nonce
  };
}

export function computeApprovalIntegrityDigest(approval: ApplyApproval): string {
  return digestJson(approvalIntegrityPayload(approval) as JsonValue);
}

/**
 * Validate the approval's integrity digest matches its payload.
 */
export function assertApprovalIntegrity(approval: ApplyApproval): void {
  const expected = computeApprovalIntegrityDigest(approval);
  if (expected !== approval.integrityDigest) {
    throw new ApplyError(
      "APPLY_APPROVAL_DIGEST_MISMATCH",
      `Approval ${approval.approvalId} integrity digest does not match its payload.`,
      { approvalId: approval.approvalId }
    );
  }
}

/**
 * Check approval expiration against the current time.
 */
export function assertApprovalNotExpired(
  approval: ApplyApproval,
  nowMs: number
): void {
  const expiresAtMs = Date.parse(approval.expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    throw new ApplyError(
      "APPLY_APPROVAL_MISSING",
      `Approval ${approval.approvalId} has an invalid expiration.`,
      { approvalId: approval.approvalId }
    );
  }
  if (nowMs > expiresAtMs) {
    throw new ApplyError(
      "APPLY_APPROVAL_EXPIRED",
      `Approval ${approval.approvalId} expired at ${approval.expiresAt}.`,
      { approvalId: approval.approvalId }
    );
  }
}

/**
 * Check that an operation is allowed by the approval.
 */
export function assertOperationAllowed(
  approval: ApplyApproval,
  operation: ApplyOperation
): void {
  if (!approval.allowedOperations.includes(operation)) {
    throw new ApplyError(
      "APPLY_APPROVAL_OPERATION_DENIED",
      `Operation "${operation}" is not allowed by approval ${approval.approvalId}.`,
      { approvalId: approval.approvalId, operation }
    );
  }
}

/**
 * Check that a path is allowed by the approval.
 */
export function assertPathAllowedByApproval(
  approval: ApplyApproval,
  path: string
): void {
  const normalized = path.replaceAll("\\", "/");
  const allowed = approval.allowedPaths.some(
    (allowedPath) =>
      normalized === allowedPath.replaceAll("\\", "/") ||
      normalized.startsWith(`${allowedPath.replaceAll("\\", "/")}/`)
  );
  if (!allowed) {
    throw new ApplyError(
      "APPLY_APPROVAL_PATH_DENIED",
      `Path "${path}" is not allowed by approval ${approval.approvalId}.`,
      { approvalId: approval.approvalId, path }
    );
  }
}

/**
 * Check that no commands are requested. Phase 9 disables command execution.
 */
export function assertNoCommands(approval: ApplyApproval): void {
  if (approval.allowedCommandIds.length > 0) {
    throw new ApplyError(
      "APPLY_APPROVAL_COMMAND_DENIED",
      `Approval ${approval.approvalId} requests command execution, which is disabled in Phase 9.`,
      { approvalId: approval.approvalId }
    );
  }
}

/**
 * Check that no network hosts are requested. Phase 9 disables network.
 */
export function assertNoNetwork(approval: ApplyApproval): void {
  if (approval.allowedNetworkHosts.length > 0) {
    throw new ApplyError(
      "APPLY_APPROVAL_NETWORK_DENIED",
      `Approval ${approval.approvalId} requests network access, which is disabled in Phase 9.`,
      { approvalId: approval.approvalId }
    );
  }
}

/**
 * Check that the approval's limits are within the sandbox policy limits.
 */
export function assertLimitsWithinPolicy(
  approval: ApplyApproval,
  policy: { maxFiles: number; maxBytes: number; maxOperations: number; maxDurationSeconds: number }
): void {
  if (approval.limits.maxFiles > policy.maxFiles) {
    throw new ApplyError(
      "APPLY_APPROVAL_LIMIT_EXCEEDED",
      `Approval ${approval.approvalId} requests more files than the sandbox policy allows.`,
      { approvalId: approval.approvalId }
    );
  }
  if (approval.limits.maxBytes > policy.maxBytes) {
    throw new ApplyError(
      "APPLY_APPROVAL_LIMIT_EXCEEDED",
      `Approval ${approval.approvalId} requests more bytes than the sandbox policy allows.`,
      { approvalId: approval.approvalId }
    );
  }
  if (approval.limits.maxOperations > policy.maxOperations) {
    throw new ApplyError(
      "APPLY_APPROVAL_LIMIT_EXCEEDED",
      `Approval ${approval.approvalId} requests more operations than the sandbox policy allows.`,
      { approvalId: approval.approvalId }
    );
  }
  if (approval.limits.maxDurationSeconds > policy.maxDurationSeconds) {
    throw new ApplyError(
      "APPLY_APPROVAL_LIMIT_EXCEEDED",
      `Approval ${approval.approvalId} requests more time than the sandbox policy allows.`,
      { approvalId: approval.approvalId }
    );
  }
}