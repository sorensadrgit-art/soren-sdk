import { digestJson, sha256Bytes, type EvidenceEnvelope } from "@soren-sdk/contracts";
import { DeterministicExecutionPlanner } from "@soren-sdk/planner";
import { DeterministicVerificationPlanner } from "@soren-sdk/verification";
import { describe, expect, it } from "vitest";

import { DeterministicEvidenceService } from "../src/index.js";

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
  requirements: [
    { id: "unit", kind: "unit", required: true },
    { id: "optional", kind: "visual", required: false }
  ]
});

function runnerResult(
  status: "passed" | "failed" | "not-run" | "not-required" | "blocked" | "cancelled" | "timed-out" | "unverified" = "passed"
) {
  return {
    runner: { id: "runner", version: "1" },
    planId: plan.executionPlanId,
    planDigest: plan.immutableDigest,
    checkId: "unit",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    status,
    exitCode: status === "passed" ? 0 : 1,
    diagnostics: [{ code: "RESULT", message: "finished" }],
    artifacts: [{ id: "unit-artifact", uri: "memory:unit", digest: sha256Bytes("unit") }],
    environment: {},
    redactions: []
  };
}

function first<T>(values: readonly T[]): T {
  const value = values[0];
  if (value === undefined) throw new Error("Expected a non-empty test fixture.");
  return value;
}

function ingested(): EvidenceEnvelope {
  return new DeterministicEvidenceService().ingest({
    plan,
    verificationPlan: verification,
    results: [runnerResult()],
    artifactContents: { "unit-artifact": "unit" }
  });
}

function recompute(evidence: EvidenceEnvelope): EvidenceEnvelope {
  const preimage = {
    projectSnapshot: evidence.projectSnapshot,
    catalogSnapshot: evidence.catalogSnapshot,
    policySnapshot: evidence.policySnapshot,
    routePlan: evidence.routePlan,
    executionPlan: evidence.executionPlan,
    checks: [...evidence.checks]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((check) => ({
        id: check.id,
        required: check.required,
        status: check.status,
        diagnostics: check.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          message: diagnostic.message
        })),
        artifacts: [...check.artifacts]
      })),
    unverified: [...evidence.unverified].sort()
  };
  const nextDigest = digestJson(preimage);
  return {
    ...evidence,
    digest: nextDigest,
    evidenceId: `evidence_${nextDigest.slice("sha256:".length, "sha256:".length + 24)}`
  };
}

describe("Evidence integrity boundaries", () => {
  it("rejects duplicate verification plan checks before ingesting results", () => {
    const service = new DeterministicEvidenceService();
    expect(() =>
      service.ingest({
        plan,
        verificationPlan: { ...verification, checks: [...verification.checks, first(verification.checks)] },
        results: [],
        artifactContents: {}
      })
    ).toThrow(/duplicate/i);
  });

  it("rejects duplicate and unexpected runner result check IDs", () => {
    const service = new DeterministicEvidenceService();
    expect(() =>
      service.ingest({
        plan,
        verificationPlan: verification,
        results: [runnerResult(), runnerResult()],
        artifactContents: { "unit-artifact": "unit" }
      })
    ).toThrow(/multiple/i);
    expect(() =>
      service.ingest({
        plan,
        verificationPlan: verification,
        results: [{ ...runnerResult(), checkId: "unknown" }],
        artifactContents: { "unit-artifact": "unit" }
      })
    ).toThrow(/unexpected/i);
  });

  it("rejects wrong runner plan ID and digest bindings", () => {
    const service = new DeterministicEvidenceService();
    expect(() =>
      service.ingest({
        plan,
        verificationPlan: verification,
        results: [{ ...runnerResult(), planId: "wrong" }],
        artifactContents: { "unit-artifact": "unit" }
      })
    ).toThrow(/another plan/i);
    expect(() =>
      service.ingest({
        plan,
        verificationPlan: verification,
        results: [{ ...runnerResult(), planDigest: digest.replace("a", "b") as `sha256:${string}` }],
        artifactContents: { "unit-artifact": "unit" }
      })
    ).toThrow(/another plan/i);
  });

  it("rejects missing, duplicated, malformed, and mismatched passed artifacts", () => {
    const service = new DeterministicEvidenceService();
    expect(() =>
      service.ingest({
        plan,
        verificationPlan: verification,
        results: [runnerResult()],
        artifactContents: {}
      })
    ).toThrow(/artifact/i);

    const duplicateId = runnerResult();
    duplicateId.artifacts.push({ ...first(duplicateId.artifacts) });
    expect(() =>
      service.ingest({
        plan,
        verificationPlan: verification,
        results: [duplicateId],
        artifactContents: { "unit-artifact": "unit" }
      })
    ).toThrow(/duplicate/i);

    const duplicateDigest = runnerResult();
    duplicateDigest.artifacts.push({ ...first(duplicateDigest.artifacts), id: "another-artifact" });
    expect(() =>
      service.ingest({
        plan,
        verificationPlan: verification,
        results: [duplicateDigest],
        artifactContents: { "unit-artifact": "unit", "another-artifact": "unit" }
      })
    ).toThrow(/duplicate/i);

    const malformed = runnerResult();
    Reflect.set(first(malformed.artifacts), "digest", "not-a-digest");
    expect(() =>
      service.ingest({
        plan,
        verificationPlan: verification,
        results: [malformed],
        artifactContents: { "unit-artifact": "unit" }
      })
    ).toThrow(/digest/i);
  });

  it("rejects contradictory runner states and timestamps", () => {
    const service = new DeterministicEvidenceService();
    const passed = runnerResult();
    passed.exitCode = 1;
    expect(() => service.ingest({ plan, verificationPlan: verification, results: [passed], artifactContents: { "unit-artifact": "unit" } })).toThrow(/exit/i);
    const failed = runnerResult("failed");
    failed.exitCode = 0;
    expect(() => service.ingest({ plan, verificationPlan: verification, results: [failed], artifactContents: { "unit-artifact": "unit" } })).toThrow(/exit/i);
    expect(() => service.ingest({ plan, verificationPlan: verification, results: [runnerResult("not-run")], artifactContents: { "unit-artifact": "unit" } })).toThrow(/not-run/i);
    expect(() => service.ingest({ plan, verificationPlan: verification, results: [runnerResult("not-required")], artifactContents: { "unit-artifact": "unit" } })).toThrow(/not-required/i);
    const backwards = runnerResult();
    backwards.completedAt = "2025-12-31T23:59:59.000Z";
    expect(() => service.ingest({ plan, verificationPlan: verification, results: [backwards], artifactContents: { "unit-artifact": "unit" } })).toThrow(/timestamp/i);
  });

  it("rejects forged state even after an attacker recomputes digest and ID", () => {
    const service = new DeterministicEvidenceService();
    const evidence = ingested();
    const extraPassed = recompute({ ...evidence, unverified: ["unit"] });
    expect(service.verify(extraPassed)).toEqual(expect.objectContaining({ ok: false }));

    const duplicateChecks = recompute({ ...evidence, checks: [...evidence.checks, { ...first(evidence.checks) }] });
    expect(service.verify(duplicateChecks)).toEqual(expect.objectContaining({ ok: false }));

    const hiddenFailure = recompute({
      ...evidence,
      checks: evidence.checks.map((check) => check.id === "unit" ? { ...check, status: "failed" } : check),
      unverified: []
    });
    expect(service.verify(hiddenFailure)).toEqual(expect.objectContaining({ ok: false }));
  });

  it("returns schema failures rather than throwing for malformed external evidence", () => {
    const service = new DeterministicEvidenceService();
    for (const candidate of [null, [], "evidence", 1, {}, { ...ingested(), unknown: true }]) {
      expect(() => service.verify(candidate)).not.toThrow();
      expect(service.verify(candidate).ok).toBe(false);
    }
  });

  it("produces deterministic identity despite equivalent runner and plan ordering", () => {
    const service = new DeterministicEvidenceService();
    const unit = runnerResult();
    unit.diagnostics = [
      { code: "Z", message: "last" },
      { code: "A", message: "first" }
    ];
    unit.artifacts.push({ id: "unit-second", uri: "memory:unit-second", digest: sha256Bytes("unit-second") });
    const optional = {
      ...runnerResult(),
      checkId: "optional",
      diagnostics: [{ code: "B", message: "second" }, { code: "A", message: "first" }],
      artifacts: [{ id: "optional-artifact", uri: "memory:optional", digest: sha256Bytes("optional") }]
    };
    const contents = {
      "unit-artifact": "unit",
      "unit-second": "unit-second",
      "optional-artifact": "optional"
    };
    const first = service.ingest({
      plan,
      verificationPlan: verification,
      results: [unit, optional],
      artifactContents: contents
    });
    const reordered = service.ingest({
      plan,
      verificationPlan: { ...verification, checks: [...verification.checks].reverse() },
      results: [
        { ...optional, diagnostics: [...optional.diagnostics].reverse() },
        { ...unit, diagnostics: [...unit.diagnostics].reverse(), artifacts: [...unit.artifacts].reverse() }
      ],
      artifactContents: contents
    });
    expect(reordered.digest).toBe(first.digest);
    expect(reordered.evidenceId).toBe(first.evidenceId);
  });

  it("rejects forged evidence during summary", () => {
    const service = new DeterministicEvidenceService();
    const forged = { ...ingested(), evidenceId: "evidence_000000000000000000000000" };
    expect(() => service.summarize({ evidence: forged })).toThrow(/invalid/i);
  });
});
