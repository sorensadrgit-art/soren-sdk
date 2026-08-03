import { describe, expect, it } from "vitest";

import { MemorySandboxProvider } from "@soren-sdk/sandbox";
import {
  createApplyServiceForTesting,
  InMemoryApprovedPlanProvider,
  InMemoryEvidenceSink,
  InMemoryProjectSnapshotProvider,
  InMemoryResolvedPolicyProvider
} from "../src/index.js";
import {
  fixedClock,
  sampleApproval,
  sampleExecutionPlan,
  sampleProjectSnapshot,
  sampleSandboxPolicy,
  sampleVcsState
} from "./fixtures.js";

function setup() {
  const plan = sampleExecutionPlan({ fileChanges: [] });
  const approval = sampleApproval({ nonce: "nonce-preparation-binding-001" });
  const project = sampleProjectSnapshot();
  const policy = { policyId: "policy_1", digest: approval.policySnapshotId, document: {} };
  const plans = new InMemoryApprovedPlanProvider();
  plans.set(plan.executionPlanId, plan, approval);
  const projects = new InMemoryProjectSnapshotProvider();
  projects.set(project);
  const policies = new InMemoryResolvedPolicyProvider();
  policies.set(policy.policyId, policy.digest, policy.document);
  const service = createApplyServiceForTesting({
    evidenceSink: new InMemoryEvidenceSink(),
    sandboxProvider: new MemorySandboxProvider(),
    clock: fixedClock(),
    approvedPlanProvider: plans,
    projectSnapshotProvider: projects,
    resolvedPolicyProvider: policies,
    sandboxPolicy: sampleSandboxPolicy(),
    vcsState: sampleVcsState()
  });
  const preparation = service.prepare({
    executionPlan: plan,
    approval,
    projectSnapshot: project,
    policySnapshot: policy,
    sandboxPolicy: sampleSandboxPolicy(),
    vcsState: sampleVcsState()
  });
  return { service, preparation };
}

describe("apply preparation binding", () => {
  it("rejects a fabricated preparation before sandbox creation", async () => {
    const { service, preparation } = setup();
    const fabricated = { ...preparation };
    await expect(service.apply({
      preparation: fabricated,
      sandboxId: "fabricated",
      contentProvider: async () => new Uint8Array()
    })).rejects.toMatchObject({ code: "APPLY_PREPARATION_INVALID" });
  });

  it("rejects a preparation modified after prepare", async () => {
    const { service, preparation } = setup();
    const modified = { ...preparation, executionPlanId: "plan-attacker" };
    await expect(service.apply({
      preparation: modified,
      sandboxId: "modified",
      contentProvider: async () => new Uint8Array()
    })).rejects.toMatchObject({ code: "APPLY_PREPARATION_INVALID" });
  });
});
