import { digestJson, sha256Bytes, type Digest, type JsonValue, type RunnerResult, type VerificationPlan, type VerificationState } from "@soren-sdk/contracts";
import type { ExecutionPlan } from "@soren-sdk/planner";

export interface RunnerResultSource { list(planId: string): RunnerResult[]; }
export interface IngestRunnerResultInput { plan: ExecutionPlan; verificationPlan: VerificationPlan; results: RunnerResult[]; artifactContents?: Record<string, string | Uint8Array>; }
export interface EvidenceEnvelope { schemaVersion: "1.0.0-draft.1"; contractKind: "evidence-envelope"; evidenceId: string; digest: Digest; projectSnapshot: Digest; catalogSnapshot: Digest; policySnapshot: Digest; routePlan: { id: string; digest: Digest }; executionPlan: { id: string; digest: Digest }; checks: Array<{ id: string; required: boolean; status: VerificationState; diagnostics: Array<{ code: string; message: string }>; artifacts: string[] }>; unverified: string[]; }
export interface EvidenceVerificationResult { ok: boolean; issues: string[]; }
export interface EvidenceQuery { evidence: EvidenceEnvelope; }
export interface EvidenceSummary { total: number; byStatus: Record<VerificationState, number>; requiredComplete: boolean; failed: string[]; }
export interface EvidenceService { ingest(input: IngestRunnerResultInput): EvidenceEnvelope; verify(evidence: unknown): EvidenceVerificationResult; summarize(query: EvidenceQuery): EvidenceSummary; }
const SECRET = /(api[_-]?key|password|secret|token|private[_-]?key)/i;
const states: VerificationState[] = ["passed", "failed", "not-run", "not-required", "blocked", "cancelled", "timed-out", "unverified"];
function json(value: unknown): JsonValue { return value as JsonValue; }
function safe(value: unknown, path = "input"): void { if (typeof value === "string" && SECRET.test(value)) throw new Error(`Secret-like data is forbidden at ${path}.`); if (Array.isArray(value)) value.forEach((entry, i) => safe(entry, `${path}[${i}]`)); if (value !== null && typeof value === "object") Object.entries(value).forEach(([key, entry]) => { if (SECRET.test(key)) throw new Error(`Secret-like field is forbidden at ${path}.${key}.`); safe(entry, `${path}.${key}`); }); }
function sort<T>(items: readonly T[], key: (item: T) => string): T[] { return [...items].sort((a, b) => key(a).localeCompare(key(b))); }
function invalidRedaction(result: RunnerResult): boolean { return result.redactions.some((value) => /checkId|status|plan(Id|Digest)|digest/i.test(value)); }
export class DeterministicEvidenceService implements EvidenceService {
  ingest(input: IngestRunnerResultInput): EvidenceEnvelope {
    safe(input); const { plan, verificationPlan } = input;
    if (verificationPlan.executionPlanId !== plan.executionPlanId || verificationPlan.executionPlanDigest !== plan.immutableDigest) throw new Error("Verification plan is not bound to the execution plan.");
    const results = new Map<string, RunnerResult>();
    for (const result of input.results) { if (result.planId !== plan.executionPlanId || result.planDigest !== plan.immutableDigest) throw new Error(`Runner result ${result.checkId} is bound to another plan.`); if (results.has(result.checkId)) throw new Error(`Multiple runner results for check ${result.checkId}.`); if (invalidRedaction(result)) throw new Error(`Redaction cannot hide identity or state for ${result.checkId}.`); for (const artifact of result.artifacts) { const content = input.artifactContents?.[artifact.id]; if (content === undefined || sha256Bytes(content) !== artifact.digest) throw new Error(`Artifact digest mismatch for ${artifact.id}.`); } results.set(result.checkId, result); }
    const expected = new Map(verificationPlan.checks.map((check) => [check.id, check]));
    for (const id of results.keys()) if (!expected.has(id)) throw new Error(`Unexpected runner check ${id}.`);
    for (const result of results.values()) {
      const check = expected.get(result.checkId);
      if (check?.required && result.status === "passed" && result.artifacts.length === 0) {
        throw new Error(`Passed required check ${result.checkId} lacks runner artifacts.`);
      }
    }
    const checks = sort(verificationPlan.checks.map((check) => { const result = results.get(check.id); const status: VerificationState = result?.status ?? check.status; if (status === "passed" && result === undefined) throw new Error(`Fabricated pass for ${check.id}.`); return { id: check.id, required: check.required, status, diagnostics: result?.diagnostics ?? [], artifacts: sort(result?.artifacts.map((artifact) => artifact.digest) ?? [], (digest) => digest) }; }), (check) => check.id);
    const unverified = checks.filter((check) => check.required && check.status !== "passed" && check.status !== "not-required").map((check) => check.id);
    const preimage = { projectSnapshot: plan.projectSnapshot, catalogSnapshot: plan.catalogSnapshot, policySnapshot: plan.policySnapshot, routePlan: plan.routePlan, executionPlan: { id: plan.executionPlanId, digest: plan.immutableDigest }, checks, unverified };
    const digest = digestJson(json(preimage)); return { schemaVersion: "1.0.0-draft.1", contractKind: "evidence-envelope", evidenceId: `evidence_${digest.slice(7, 31)}`, digest, ...preimage };
  }
  verify(evidence: unknown): EvidenceVerificationResult { if (evidence === null || typeof evidence !== "object") return { ok: false, issues: ["Evidence must be an object."] }; const item = evidence as Partial<EvidenceEnvelope>; if (item.contractKind !== "evidence-envelope" || item.digest === undefined || item.checks === undefined || item.executionPlan === undefined || item.routePlan === undefined || item.projectSnapshot === undefined || item.catalogSnapshot === undefined || item.policySnapshot === undefined || item.unverified === undefined) return { ok: false, issues: ["Evidence is incomplete."] }; const checks = sort(item.checks, (check) => check.id); const expectedUnverified = checks.filter((check) => check.required && check.status !== "passed" && check.status !== "not-required").map((check) => check.id); const unverified = sort([...new Set(item.unverified)], (id) => id); const computed = digestJson(json({ projectSnapshot: item.projectSnapshot, catalogSnapshot: item.catalogSnapshot, policySnapshot: item.policySnapshot, routePlan: item.routePlan, executionPlan: item.executionPlan, checks, unverified })); const issues = computed === item.digest ? [] : ["Evidence digest mismatch."]; if (item.evidenceId !== `evidence_${computed.slice(7, 31)}`) issues.push("Evidence id is not derived from its digest."); if (JSON.stringify(unverified) !== JSON.stringify(expectedUnverified)) issues.push("Unverified checks are inconsistent with required check states."); for (const check of checks) if (check.required && check.status === "passed" && check.artifacts.length === 0) issues.push(`Passed required check ${check.id} lacks artifacts.`); return { ok: issues.length === 0, issues }; }
  summarize(query: EvidenceQuery): EvidenceSummary { const byStatus = Object.fromEntries(states.map((state) => [state, 0])) as Record<VerificationState, number>; for (const check of query.evidence.checks) byStatus[check.status] += 1; const failed = query.evidence.checks.filter((check) => check.status === "failed").map((check) => check.id); return { total: query.evidence.checks.length, byStatus, requiredComplete: query.evidence.unverified.length === 0, failed }; }
}
