import { describe, expect, it } from "vitest";

import { canonicalJson } from "@soren-sdk/contracts";

import {
  createExecutionPlan,
  createEvidenceEnvelope,
  ingestRunnerResults,
  type PlanInput,
  type RunnerResult
} from "../src/index.js";

const input: PlanInput = {
  projectSnapshotId: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  catalogSnapshotId: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  policySnapshotId: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  routePlanId: "route-1",
  dependencies: [{ operation: "add", workspace: "packages/core", package: "zod", version: "1.0.0", kind: "dependency", reason: "validation" }],
  files: [{ operation: "update", path: "packages/core/src/a.ts", contentDigest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" }],
  commands: [{ argv: ["pnpm", "test"], cwd: ".", timeoutSeconds: 60, networkRequired: false }],
  requiredChecks: [{ id: "unit", reason: "changed core source", affectedPaths: ["packages/core"] }]
};

describe("planning and evidence services", () => {
  it("creates deterministic content-addressed plans despite input ordering and timestamps", () => {
    const first = createExecutionPlan(input, "2026-01-01T00:00:00.000Z");
    const second = createExecutionPlan({ ...input, files: [...input.files].reverse() }, "2027-01-01T00:00:00.000Z");
    expect(first.executionPlanId).toBe(second.executionPlanId);
    expect(first.immutableDigest).toBe(second.immutableDigest);
  });

  it("does not accept forged passed checks, wrong plans, missing checks, or bad artifact digests", () => {
    const plan = createExecutionPlan(input, "2026-01-01T00:00:00.000Z");
    const forged: RunnerResult = { planId: plan.executionPlanId, planDigest: plan.immutableDigest, checkId: "unit", status: "passed", runnerId: "agent", trusted: false, exitCode: 0, artifacts: [] };
    const wrongPlan: RunnerResult = { ...forged, trusted: true, planId: "other" as never };
    const badArtifact: RunnerResult = { ...forged, trusted: true, artifacts: [{ id: "a", kind: "screenshot", locator: "file.png", digest: "sha256:bad" as never, observedDigest: "sha256:other" as never }] };
    expect(ingestRunnerResults(plan, [forged]).checks[0]).toMatchObject({ status: "not-run" });
    expect(ingestRunnerResults(plan, [wrongPlan]).unverified).toContain("unit");
    expect(ingestRunnerResults(plan, [badArtifact]).checks[0]).toMatchObject({ status: "not-run" });
  });

  it("preserves failures, redacts artifact metadata, and content-addresses runner-backed evidence", () => {
    const plan = createExecutionPlan(input, "2026-01-01T00:00:00.000Z");
    const result: RunnerResult = { planId: plan.executionPlanId, planDigest: plan.immutableDigest, checkId: "unit", status: "failed", runnerId: "runner-1", trusted: true, exitCode: 1, artifacts: [{ id: "log", kind: "log", locator: "https://example.test/?token=secret", digest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", observedDigest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" }] };
    const verification = ingestRunnerResults(plan, [result]);
    expect(verification.checks[0]).toMatchObject({ status: "failed" });
    const evidence = createEvidenceEnvelope(plan, verification, { runId: "run-1", startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:01:00.000Z" });
    expect(canonicalJson(evidence as never)).not.toContain("secret");
    expect(evidence.digest).toMatch(/^sha256:/);
  });
});
