import type { Digest, ExecutionPlan, ProjectSnapshot } from "@soren-sdk/contracts";

import type { ApplyApproval } from "./types.js";
import { ApplyError } from "./types.js";

/**
 * Verify the approval is bound to the exact execution plan.
 */
export function assertApprovalBindsPlan(
  approval: ApplyApproval,
  plan: ExecutionPlan
): void {
  if (approval.executionPlanId !== plan.executionPlanId) {
    throw new ApplyError(
      "APPLY_DRIFT_PLAN",
      `Approval ${approval.approvalId} is bound to plan ${approval.executionPlanId}, but the current plan is ${plan.executionPlanId}.`,
      { approvalId: approval.approvalId }
    );
  }
  if (approval.executionPlanDigest !== plan.immutableDigest) {
    throw new ApplyError(
      "APPLY_DRIFT_PLAN",
      `Approval ${approval.approvalId} is bound to plan digest ${approval.executionPlanDigest}, but the current plan digest is ${plan.immutableDigest}.`,
      { approvalId: approval.approvalId }
    );
  }
}

/**
 * Verify the approval is bound to the exact project snapshot.
 */
export function assertApprovalBindsProject(
  approval: ApplyApproval,
  projectSnapshot: ProjectSnapshot
): void {
  if (approval.projectSnapshotId !== projectSnapshot.snapshotId) {
    throw new ApplyError(
      "APPLY_DRIFT_PROJECT",
      `Approval ${approval.approvalId} is bound to project snapshot ${approval.projectSnapshotId}, but the current snapshot is ${projectSnapshot.snapshotId}.`,
      { approvalId: approval.approvalId }
    );
  }
}

/**
 * Verify the approval is bound to the exact policy snapshot.
 */
export function assertApprovalBindsPolicy(
  approval: ApplyApproval,
  policySnapshot: { policyId: string; digest: Digest }
): void {
  if (approval.policySnapshotId !== policySnapshot.digest) {
    throw new ApplyError(
      "APPLY_DRIFT_POLICY",
      `Approval ${approval.approvalId} is bound to policy snapshot ${approval.policySnapshotId}, but the current snapshot is ${policySnapshot.digest}.`,
      { approvalId: approval.approvalId }
    );
  }
}

/**
 * Verify the plan is an apply-mode plan whose approval is required.
 */
export function assertPlanApplyMode(plan: ExecutionPlan): void {
  if (plan.mode !== "apply") {
    throw new ApplyError(
      "APPLY_DRIFT_PLAN",
      `Plan ${plan.executionPlanId} is not an apply-mode plan.`,
      { planId: plan.executionPlanId }
    );
  }
  if (!plan.approval.required) {
    throw new ApplyError(
      "APPLY_APPROVAL_MISSING",
      `Plan ${plan.executionPlanId} does not require approval.`,
      { planId: plan.executionPlanId }
    );
  }
}

/**
 * Convert a plan file change into an allowed apply operation, or throw.
 */
export function planOperationFor(
  operation: "create" | "delete" | "update"
): "create-file" | "delete-file" | "replace-file" {
  switch (operation) {
    case "create":
      return "create-file";
    case "delete":
      return "delete-file";
    case "update":
      return "replace-file";
  }
}

/**
 * Derive the deterministic operation list from the immutable plan.
 */
export function operationsFromPlan(plan: ExecutionPlan): Array<{
  index: number;
  operation: "create-file" | "replace-file" | "delete-file";
  path: string;
  contentDigest: Digest | null;
}> {
  return plan.fileChanges
    .map((change, index) => ({
      index,
      operation: planOperationFor(change.operation),
      path: change.path,
      contentDigest: change.contentDigest
    }))
    .sort((left, right) => left.index - right.index);
}