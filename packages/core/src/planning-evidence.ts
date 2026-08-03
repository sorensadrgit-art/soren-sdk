import { canonicalJson, digestJson, type Digest } from "@soren-sdk/contracts";

export type CheckState = "failed" | "not-required" | "not-run" | "passed";

export interface PlanInput {
  projectSnapshotId: Digest;
  catalogSnapshotId: Digest;
  policySnapshotId: Digest;
  routePlanId: string;
  dependencies: Array<{ operation: "add" | "remove" | "update"; workspace: string; package: string; version: string | null; kind: "dependency" | "devDependency" | "optionalDependency" | "peerDependency"; reason: string }>;
  files: Array<{ operation: "create" | "delete" | "update"; path: string; contentDigest: Digest | null }>;
  commands: Array<{ argv: string[]; cwd: string; timeoutSeconds: number; networkRequired: boolean }>;
  requiredChecks: Array<{ id: string; reason: string; affectedPaths: string[] }>;
}

export interface ExecutionPlanRecord extends PlanInput {
  schemaVersion: "1.0.0-draft.1";
  contractKind: "execution-plan";
  executionPlanId: Digest;
  immutableDigest: Digest;
  createdAt: string;
  mode: "plan";
}

export interface ArtifactReference {
  id: string;
  kind: "log" | "performance" | "screenshot";
  locator: string;
  digest: Digest;
  observedDigest: Digest;
}

export interface RunnerResult {
  planId: Digest;
  planDigest: Digest;
  checkId: string;
  status: "failed" | "passed";
  runnerId: string;
  trusted: boolean;
  exitCode: number;
  artifacts: ArtifactReference[];
}

export interface VerificationResult {
  checks: Array<{ id: string; status: CheckState; reason: string; artifacts: ArtifactReference[] }>;
  unverified: string[];
}

function ordered<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}

function immutablePayload(input: PlanInput): Omit<PlanInput, "requiredChecks"> & { requiredChecks: PlanInput["requiredChecks"] } {
  return {
    ...input,
    dependencies: ordered(input.dependencies, (value) => `${value.workspace}\u0000${value.package}\u0000${value.kind}`),
    files: ordered(input.files, (value) => value.path),
    commands: ordered(input.commands, (value) => canonicalJson(value as never)),
    requiredChecks: ordered(input.requiredChecks.map((value) => ({ ...value, affectedPaths: [...value.affectedPaths].sort() })), (value) => value.id)
  };
}

export function createExecutionPlan(input: PlanInput, createdAt: string): ExecutionPlanRecord {
  const payload = immutablePayload(input);
  const immutableDigest = digestJson(payload as never);
  return {
    ...payload,
    schemaVersion: "1.0.0-draft.1",
    contractKind: "execution-plan",
    executionPlanId: immutableDigest,
    immutableDigest,
    createdAt,
    mode: "plan"
  };
}

function redact(value: string): string {
  return /(?:token|secret|password|api[_-]?key)=/i.test(value) ? "[REDACTED]" : value;
}

function verifiedArtifacts(artifacts: ArtifactReference[]): ArtifactReference[] | undefined {
  if (artifacts.some((artifact) => artifact.digest !== artifact.observedDigest)) return undefined;
  return artifacts.map((artifact) => ({ ...artifact, locator: redact(artifact.locator) }));
}

export function ingestRunnerResults(plan: ExecutionPlanRecord, results: RunnerResult[]): VerificationResult {
  const checks = plan.requiredChecks.map((requirement) => {
    const candidate = results.find((result) => result.checkId === requirement.id && result.planId === plan.executionPlanId && result.planDigest === plan.immutableDigest && result.trusted);
    const artifacts = candidate === undefined ? undefined : verifiedArtifacts(candidate.artifacts);
    if (candidate === undefined || artifacts === undefined) {
      return { id: requirement.id, status: "not-run" as const, reason: requirement.reason, artifacts: [] };
    }
    return { id: requirement.id, status: candidate.status, reason: requirement.reason, artifacts };
  });
  return { checks, unverified: checks.filter((check) => check.status === "not-run").map((check) => check.id) };
}

export function createEvidenceEnvelope(
  plan: ExecutionPlanRecord,
  verification: VerificationResult,
  run: { runId: string; startedAt: string; completedAt: string }
): { runId: string; startedAt: string; completedAt: string; projectSnapshotId: Digest; catalogSnapshotId: Digest; policySnapshotId: Digest; routePlanId: string; executionPlanId: Digest; immutablePlanDigest: Digest; checks: VerificationResult["checks"]; unverified: string[]; digest: Digest } {
  const payload = {
    runId: run.runId,
    projectSnapshotId: plan.projectSnapshotId,
    catalogSnapshotId: plan.catalogSnapshotId,
    policySnapshotId: plan.policySnapshotId,
    routePlanId: plan.routePlanId,
    executionPlanId: plan.executionPlanId,
    immutablePlanDigest: plan.immutableDigest,
    checks: verification.checks,
    unverified: verification.unverified
  };
  return { ...payload, startedAt: run.startedAt, completedAt: run.completedAt, digest: digestJson(payload as never) };
}
