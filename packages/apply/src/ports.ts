import type { Digest, ExecutionPlan, ProjectSnapshot } from "@soren-sdk/contracts";
import type { SandboxPolicy } from "@soren-sdk/sandbox";

import type { ApplyApproval, ApplyEvidenceEvent, ApplyPreparation, PrepareApplyInput } from "./types.js";

export interface PreparationStore {
  put(preparation: ApplyPreparation, input: PrepareApplyInput): void;
  get(runId: string): { preparation: ApplyPreparation; input: PrepareApplyInput } | null;
  consume(runId: string): void;
}

/**
 * Provider of approved plans. In Phase 9 this is a local port backed by
 * fakes. Future mapping: Phase 5/8 planning evidence will supply the
 * immutable execution plan and its approval.
 */
export interface ApprovedPlanProvider {
  getApprovedPlan(executionPlanId: string): Promise<{
    executionPlan: ExecutionPlan;
    approval: ApplyApproval;
  } | null>;
}

/**
 * Evidence sink for apply audit events. In Phase 9 this is a local port
 * backed by fakes. Future mapping: Phase 8 evidence envelope will consume
 * these events.
 */
export interface ApplyEvidenceSink {
  record(event: ApplyEvidenceEvent): Promise<void>;
  list(runId: string): Promise<ApplyEvidenceEvent[]>;
}

/**
 * Provider of resolved policy snapshots. In Phase 9 this is a local port
 * backed by fakes. Future mapping: Phase 5 policy resolution will supply
 * the policy snapshot digest.
 */
export interface ResolvedPolicyProvider {
  getPolicySnapshot(policyId: string): Promise<{
    policyId: string;
    digest: Digest;
    document: unknown;
  } | null>;
}

/**
 * Provider of project snapshots. In Phase 9 this is a local port backed by
 * fakes. Future mapping: Phase 3 project inspector will supply the current
 * project snapshot for drift checks.
 */
export interface ProjectSnapshotProvider {
  getProjectSnapshot(snapshotId: Digest): Promise<ProjectSnapshot | null>;
}

/**
 * Provider of sandbox policies. In Phase 9 this is a local port backed by
 * fakes.
 */
export interface SandboxPolicyProvider {
  getSandboxPolicy(policyId: string): Promise<SandboxPolicy | null>;
}