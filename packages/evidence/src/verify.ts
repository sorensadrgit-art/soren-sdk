import {
  validateContract,
  type EvidenceEnvelope,
  type VerificationState
} from "@soren-sdk/contracts";

import {
  copyJsonValue,
  deriveUnverified,
  digestEvidence,
  evidenceIdFromDigest,
  hasDuplicateIds,
  isDigest,
  normalizeChecks
} from "./normalization.js";
import type { EvidenceVerificationResult } from "./types.js";

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function stateIssues(evidence: EvidenceEnvelope): string[] {
  const issues: string[] = [];
  if (hasDuplicateIds(evidence.checks)) issues.push("EVIDENCE_CHECK_DUPLICATE");
  for (const check of evidence.checks) {
    if (check.required && check.status === "passed" && check.artifacts.length === 0) {
      issues.push(`EVIDENCE_REQUIRED_ARTIFACT_MISSING:${check.id}`);
    }
    if (check.required && check.status === "not-required") {
      issues.push(`EVIDENCE_REQUIRED_STATE_INVALID:${check.id}`);
    }
    if (check.artifacts.some((artifact) => !isDigest(artifact))) {
      issues.push(`EVIDENCE_ARTIFACT_DIGEST_INVALID:${check.id}`);
    }
  }
  const expectedUnverified = deriveUnverified(normalizeChecks(evidence.checks));
  const actualUnverified = [...evidence.unverified].sort();
  if (new Set(evidence.unverified).size !== evidence.unverified.length || !sameStrings(actualUnverified, expectedUnverified)) {
    issues.push("EVIDENCE_UNVERIFIED_MISMATCH");
  }
  return issues;
}

export function verifyEvidence(evidence: unknown): EvidenceVerificationResult {
  let safeEvidence;
  try {
    safeEvidence = copyJsonValue(evidence, "evidence");
  } catch {
    return { ok: false, issues: ["EVIDENCE_SCHEMA_INVALID"] };
  }
  const result = validateContract<EvidenceEnvelope>("evidence-envelope", safeEvidence);
  if (!result.ok) return { ok: false, issues: ["EVIDENCE_SCHEMA_INVALID"] };

  const validated = result.value;
  const issues = stateIssues(validated);
  const digest = digestEvidence(validated);
  if (digest !== validated.digest) issues.push("EVIDENCE_DIGEST_MISMATCH");
  if (evidenceIdFromDigest(validated.digest) !== validated.evidenceId) {
    issues.push("EVIDENCE_ID_MISMATCH");
  }
  return { ok: issues.length === 0, issues: [...new Set(issues)].sort() };
}

export function summarizeEvidence(evidence: EvidenceEnvelope): {
  total: number;
  byStatus: Record<VerificationState, number>;
  requiredComplete: boolean;
  failed: string[];
} {
  const verification = verifyEvidence(evidence);
  if (!verification.ok) throw new Error(`Evidence is invalid: ${verification.issues.join(", ")}`);
  const states: VerificationState[] = [
    "passed",
    "failed",
    "not-run",
    "not-required",
    "blocked",
    "cancelled",
    "timed-out",
    "unverified"
  ];
  const byStatus = Object.fromEntries(states.map((state) => [state, 0])) as Record<VerificationState, number>;
  for (const check of evidence.checks) byStatus[check.status] += 1;
  return {
    total: evidence.checks.length,
    byStatus,
    requiredComplete: deriveUnverified(evidence.checks).length === 0,
    failed: evidence.checks.filter((check) => check.status === "failed").map((check) => check.id).sort()
  };
}
