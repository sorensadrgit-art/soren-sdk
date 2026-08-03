import { digestJson, sha256Bytes, type JsonValue } from "@soren-sdk/contracts";
import { DeterministicExecutionPlanner } from "@soren-sdk/planner";
import { DeterministicVerificationPlanner } from "@soren-sdk/verification";
import { describe, expect, it } from "vitest";

import {
  DeterministicEvidenceService,
  type EvidenceEnvelope
} from "../src/index.js";

const digest = `sha256:${"a".repeat(64)}` as `sha256:${string}`;
const plan = new DeterministicExecutionPlanner().create({
  projectSnapshot: digest,
  catalogSnapshot: digest,
  policySnapshot: digest,
  routePlan: { id: "route", digest },
  contextReferences: [],
  objective: "test",
  constraints: []
});
const verification = new DeterministicVerificationPlanner().create({
  executionPlan: plan,
  requirements: [{ id: "unit", kind: "unit", required: true }]
});

function result(status: "passed" | "failed", withArtifact = true) {
  return {
    runner: { id: "fake", version: "1" },
    planId: plan.executionPlanId,
    planDigest: plan.immutableDigest,
    checkId: "unit",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    status,
    exitCode: status === "passed" ? 0 : 1,
    diagnostics: [],
    artifacts: withArtifact
      ? [
          {
            id: "unit-artifact",
            uri: "memory:unit",
            digest: sha256Bytes("unit")
          }
        ]
      : [],
    environment: {},
    redactions: []
  };
}

function recompute(evidence: EvidenceEnvelope): EvidenceEnvelope {
  const payload = {
    projectSnapshot: evidence.projectSnapshot,
    catalogSnapshot: evidence.catalogSnapshot,
    policySnapshot: evidence.policySnapshot,
    routePlan: evidence.routePlan,
    executionPlan: evidence.executionPlan,
    checks: [...evidence.checks].sort((left, right) =>
      left.id.localeCompare(right.id)
    ),
    unverified: [...evidence.unverified].sort()
  };
  const nextDigest = digestJson(payload as unknown as JsonValue);
  return {
    ...evidence,
    digest: nextDigest,
    evidenceId: `evidence_${nextDigest.slice(7, 31)}`
  };
}

describe("Phase 8 evidence master review regressions", () => {
  it("rejects a passed required check without runner artifacts during ingestion", () => {
    const service = new DeterministicEvidenceService();
    expect(() =>
      service.ingest({
        plan,
        verificationPlan: verification,
        results: [result("passed", false)],
        artifactContents: {}
      })
    ).toThrow(/artifact/i);
  });

  it("rejects an evidence id that is not derived from its digest", () => {
    const service = new DeterministicEvidenceService();
    const evidence = service.ingest({
      plan,
      verificationPlan: verification,
      results: [result("passed")],
      artifactContents: { "unit-artifact": "unit" }
    });

    expect(
      service.verify({ ...evidence, evidenceId: "evidence_wrong" }).ok
    ).toBe(false);
  });

  it("rejects an unverified list inconsistent with required check states", () => {
    const service = new DeterministicEvidenceService();
    const failed = service.ingest({
      plan,
      verificationPlan: verification,
      results: [result("failed")],
      artifactContents: { "unit-artifact": "unit" }
    });
    const forged = recompute({ ...failed, unverified: [] });

    const verificationResult = service.verify(forged);
    expect(verificationResult.ok).toBe(false);
    expect(verificationResult.issues.join(" ")).toMatch(/unverified|required/i);
  });
});
