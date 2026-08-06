import {
  sha256Bytes,
  type EvidenceCheck,
  type EvidenceEnvelope,
  type RunnerResult,
  type VerificationState
} from "@soren-sdk/contracts";

import {
  assertNoSecrets,
  copyJsonValue,
  deriveUnverified,
  digestEvidence,
  evidenceIdFromDigest,
  hasDuplicateIds,
  isDigest,
  normalizeChecks
} from "./normalization.js";
import type { IngestRunnerResultInput } from "./types.js";

const RUNNER_STATES = new Set<VerificationState>([
  "passed",
  "failed",
  "blocked",
  "cancelled",
  "timed-out",
  "unverified"
]);

function isIsoDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value));
}

function isProtectedRedaction(value: string): boolean {
  return /checkId|status|planId|planDigest|artifact.*digest|digest/i.test(value);
}

function requireNonEmpty(value: string, field: string): void {
  if (value.trim() === "") throw new Error(`Runner ${field} must not be empty.`);
}

function validateRunnerResult(result: RunnerResult, input: IngestRunnerResultInput): void {
  copyJsonValue(result, "runner result");
  assertNoSecrets(result, "runner result");
  if (result.planId !== input.plan.executionPlanId || result.planDigest !== input.plan.immutableDigest) {
    throw new Error(`Runner result ${result.checkId} is bound to another plan.`);
  }
  requireNonEmpty(result.checkId, "check ID");
  requireNonEmpty(result.runner.id, "ID");
  requireNonEmpty(result.runner.version, "version");
  if (result.status === "not-run" || result.status === "not-required") {
    throw new Error(`Runner result ${result.checkId} cannot declare ${result.status}.`);
  }
  if (!RUNNER_STATES.has(result.status)) throw new Error(`Runner result ${result.checkId} has an unsupported state.`);
  if (result.status === "passed" && result.exitCode !== 0) {
    throw new Error(`Runner result ${result.checkId} passed with a nonzero exit code.`);
  }
  if (result.status === "failed" && result.exitCode === 0) {
    throw new Error(`Runner result ${result.checkId} failed with a successful exit code.`);
  }
  if (!isIsoDateTime(result.startedAt) || !isIsoDateTime(result.completedAt) || Date.parse(result.completedAt) < Date.parse(result.startedAt)) {
    throw new Error(`Runner result ${result.checkId} has invalid timestamps.`);
  }
  if (result.redactions.some(isProtectedRedaction)) {
    throw new Error(`Redaction cannot hide identity or state for ${result.checkId}.`);
  }
}

function validateArtifacts(result: RunnerResult, input: IngestRunnerResultInput): void {
  const ids = new Set<string>();
  const digests = new Set<string>();
  for (const artifact of result.artifacts) {
    if (artifact.id.trim() === "") throw new Error("Artifact ID must not be empty.");
    if (!isDigest(artifact.digest)) throw new Error(`Artifact digest is invalid for ${artifact.id}.`);
    if (ids.has(artifact.id)) throw new Error(`Duplicate artifact ID ${artifact.id}.`);
    if (digests.has(artifact.digest)) throw new Error(`Duplicate artifact digest for ${artifact.id}.`);
    ids.add(artifact.id);
    digests.add(artifact.digest);
    const content = input.artifactContents?.[artifact.id];
    if (content === undefined) throw new Error(`Artifact content is missing for ${artifact.id}.`);
    if (sha256Bytes(content) !== artifact.digest) throw new Error(`Artifact digest mismatch for ${artifact.id}.`);
  }
  if (result.status === "passed" && result.artifacts.length === 0) {
    throw new Error(`Passed check ${result.checkId} requires an artifact.`);
  }
}

export function ingestEvidence(input: IngestRunnerResultInput): EvidenceEnvelope {
  const { plan, verificationPlan } = input;
  if (verificationPlan.executionPlanId !== plan.executionPlanId || verificationPlan.executionPlanDigest !== plan.immutableDigest) {
    throw new Error("Verification plan is not bound to the execution plan.");
  }
  if (hasDuplicateIds(verificationPlan.checks)) throw new Error("Duplicate verification-plan check ID.");
  for (const check of verificationPlan.checks) {
    if (check.required && check.status === "not-required") {
      throw new Error(`Required verification check ${check.id} cannot be not-required.`);
    }
  }

  const expected = new Map(verificationPlan.checks.map((check) => [check.id, check]));
  const results = new Map<string, RunnerResult>();
  for (const result of input.results) {
    if (results.has(result.checkId)) throw new Error(`Multiple runner results for check ${result.checkId}.`);
    if (!expected.has(result.checkId)) throw new Error(`Unexpected runner check ${result.checkId}.`);
    validateRunnerResult(result, input);
    validateArtifacts(result, input);
    results.set(result.checkId, result);
  }

  const checks: EvidenceCheck[] = verificationPlan.checks.map((check) => {
    const result = results.get(check.id);
    if (result === undefined && check.status === "passed") {
      throw new Error(`Fabricated pass for ${check.id}.`);
    }
    const status = result?.status ?? check.status;
    if (check.required && status === "passed" && result === undefined) {
      throw new Error(`Required passed check ${check.id} lacks runner proof.`);
    }
    return {
      id: check.id,
      required: check.required,
      status,
      diagnostics: result?.diagnostics.map((diagnostic) => ({ ...diagnostic })) ?? [],
      artifacts: result?.artifacts.map((artifact) => artifact.digest) ?? []
    };
  });
  const normalizedChecks = normalizeChecks(checks);
  const unverified = deriveUnverified(normalizedChecks);
  const semantic = {
    projectSnapshot: plan.projectSnapshot,
    catalogSnapshot: plan.catalogSnapshot,
    policySnapshot: plan.policySnapshot,
    routePlan: { ...plan.routePlan },
    executionPlan: { id: plan.executionPlanId, digest: plan.immutableDigest },
    checks: normalizedChecks,
    unverified
  };
  const digest = digestEvidence(semantic);
  return {
    schemaVersion: "1.0.0-draft.1",
    contractKind: "evidence-envelope",
    evidenceId: evidenceIdFromDigest(digest),
    digest,
    ...semantic
  };
}
