import type { Digest, ExecutionPlan, ProjectSnapshot } from "@soren-sdk/contracts";
import type { SandboxPolicy } from "@soren-sdk/sandbox";

import type {
  ApplyApproval,
  ApplyEvidenceEvent
} from "./types.js";
import type {
  ApplyEvidenceSink,
  ApprovedPlanProvider,
  ProjectSnapshotProvider,
  ResolvedPolicyProvider,
  SandboxPolicyProvider
} from "./ports.js";

/**
 * In-memory approved plan provider fake.
 */
export class InMemoryApprovedPlanProvider implements ApprovedPlanProvider {
  readonly #plans = new Map<
    string,
    { executionPlan: ExecutionPlan; approval: ApplyApproval }
  >();

  set(executionPlanId: string, plan: ExecutionPlan, approval: ApplyApproval): void {
    this.#plans.set(executionPlanId, { executionPlan: plan, approval });
  }

  async getApprovedPlan(
    executionPlanId: string
  ): Promise<{ executionPlan: ExecutionPlan; approval: ApplyApproval } | null> {
    return this.#plans.get(executionPlanId) ?? null;
  }
}

/**
 * In-memory evidence sink fake.
 */
export class InMemoryEvidenceSink implements ApplyEvidenceSink {
  readonly #events: ApplyEvidenceEvent[] = [];

  async record(event: ApplyEvidenceEvent): Promise<void> {
    this.#events.push(event);
  }

  async list(runId: string): Promise<ApplyEvidenceEvent[]> {
    return this.#events
      .filter((event) => event.runId === runId)
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  }

  all(): readonly ApplyEvidenceEvent[] {
    return this.#events;
  }
}

/**
 * In-memory resolved policy provider fake.
 */
export class InMemoryResolvedPolicyProvider implements ResolvedPolicyProvider {
  readonly #policies = new Map<
    string,
    { policyId: string; digest: Digest; document: unknown }
  >();

  set(policyId: string, digest: Digest, document: unknown): void {
    this.#policies.set(policyId, { policyId, digest, document });
  }

  async getPolicySnapshot(policyId: string): Promise<{
    policyId: string;
    digest: Digest;
    document: unknown;
  } | null> {
    return this.#policies.get(policyId) ?? null;
  }
}

/**
 * In-memory project snapshot provider fake.
 */
export class InMemoryProjectSnapshotProvider implements ProjectSnapshotProvider {
  readonly #snapshots = new Map<Digest, ProjectSnapshot>();

  set(snapshot: ProjectSnapshot): void {
    this.#snapshots.set(snapshot.snapshotId, snapshot);
  }

  async getProjectSnapshot(snapshotId: Digest): Promise<ProjectSnapshot | null> {
    return this.#snapshots.get(snapshotId) ?? null;
  }
}

/**
 * In-memory sandbox policy provider fake.
 */
export class InMemorySandboxPolicyProvider implements SandboxPolicyProvider {
  readonly #policies = new Map<string, SandboxPolicy>();

  set(policy: SandboxPolicy): void {
    this.#policies.set(policy.policyId, policy);
  }

  async getSandboxPolicy(policyId: string): Promise<SandboxPolicy | null> {
    return this.#policies.get(policyId) ?? null;
  }
}