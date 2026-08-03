import type { Digest, ExecutionPlan, ProjectSnapshot } from "@soren-sdk/contracts";
import type { SandboxPolicy, VcsState } from "@soren-sdk/sandbox";

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
  getCurrentPolicySnapshot(policyId: string): Promise<{
    policyId: string;
    digest: Digest;
    document: unknown;
  } | null>;
}

/**
 * Provider of the current project snapshot at the mutation boundary.
 */
export interface ProjectSnapshotProvider {
  getCurrentProjectSnapshot(): Promise<ProjectSnapshot | null>;
}

/** Provider of current VCS state at the mutation boundary. */
export interface VcsStateProvider {
  getCurrentVcsState(): Promise<VcsState | null>;
}

/** Provider of the current sandbox policy at the mutation boundary. */
export interface SandboxPolicyProvider {
  getCurrentSandboxPolicy(policyId: string): Promise<SandboxPolicy | null>;
}

export interface AuthoritativeApplyStateProviders {
  approvedPlanProvider: ApprovedPlanProvider;
  projectSnapshotProvider: ProjectSnapshotProvider;
  resolvedPolicyProvider: ResolvedPolicyProvider;
  vcsStateProvider: VcsStateProvider;
  sandboxPolicyProvider: SandboxPolicyProvider;
}