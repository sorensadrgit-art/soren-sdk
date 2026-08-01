import { digestJson, validateContract, type Digest, type JsonValue } from "@soren-sdk/contracts";

export type PlanStatus = "ready" | "needs-input" | "blocked";
export interface PlanningInputs {
  projectSnapshot: Digest;
  catalogSnapshot: Digest;
  policySnapshot: Digest;
  routePlan: { id: string; digest: Digest };
  contextReferences: Array<{ id: string; digest: Digest }>;
  objective: string;
  constraints: string[];
  lockfile?: { id: string; digest: Digest };
  runnerCapabilities?: Record<string, JsonValue>;
}
export interface CreateExecutionPlanInput extends PlanningInputs {
  createdAt?: string;
  providers?: Array<{ id: string; integrations: string[] }>;
  dependencies?: Array<{ operation: "add" | "remove" | "update"; workspace: string; package: string; version: string | null; kind: "dependency" | "devDependency" | "optionalDependency" | "peerDependency"; reason: string }>;
  fileOperations?: Array<{ operation: "create" | "update" | "delete"; path: string; contentDigest: Digest | null }>;
  commands?: Array<{ argv: string[]; cwd: string; timeoutSeconds: number; networkRequired: boolean }>;
  permissions?: Array<"command-execution" | "credential-use" | "network" | "project-write" | "release">;
  verification?: string[];
  expectedArtifacts?: string[];
  rollback?: string[];
  affectedScopes?: string[];
  risks?: string[];
  unresolvedInputs?: string[];
  deniedSteps?: string[];
}
export interface ExecutionPlan extends Omit<CreateExecutionPlanInput, "createdAt"> {
  schemaVersion: "1.0.0-draft.1";
  contractKind: "execution-plan";
  executionPlanId: string;
  immutableDigest: Digest;
  createdAt: string;
  routePlanId: string;
  routePlanDigest: Digest;
  mode: "plan";
  status: PlanStatus;
  fileChanges: NonNullable<CreateExecutionPlanInput["fileOperations"]>;
  dependencyChanges: NonNullable<CreateExecutionPlanInput["dependencies"]>;
  networkDestinations: string[];
  credentials: string[];
  approval: { required: boolean; scopes: NonNullable<CreateExecutionPlanInput["permissions"]> };
}
export interface PlanValidationResult { ok: boolean; issues: string[]; }
export interface PlanDriftReport { drifted: boolean; differences: string[]; }
export interface PlanEvidenceProvider { getPlan(planId: string): ExecutionPlan | undefined; }

const SECRET = /(api[_-]?key|password|secret|token|private[_-]?key)/i;
function stable<T>(items: readonly T[], key: (item: T) => string): T[] { return [...items].sort((a, b) => key(a).localeCompare(key(b))); }
function json(value: unknown): JsonValue { return value as JsonValue; }
function assertSafe(value: unknown, path = "input"): void {
  if (typeof value === "string" && SECRET.test(value)) throw new Error(`Secret-like data is forbidden at ${path}.`);
  if (Array.isArray(value)) value.forEach((entry, index) => assertSafe(entry, `${path}[${index}]`));
  if (value !== null && typeof value === "object") Object.entries(value).forEach(([key, entry]) => { if (SECRET.test(key)) throw new Error(`Secret-like field is forbidden at ${path}.${key}.`); assertSafe(entry, `${path}.${key}`); });
}
function normalize(input: CreateExecutionPlanInput): Omit<ExecutionPlan, "executionPlanId" | "immutableDigest" | "createdAt"> {
  assertSafe(input);
  const unresolved = stable(input.unresolvedInputs ?? [], (v) => v);
  const denied = stable(input.deniedSteps ?? [], (v) => v);
  const status: PlanStatus = denied.length > 0 ? "blocked" : unresolved.length > 0 || input.objective.trim() === "" ? "needs-input" : "ready";
  return {
    ...input,
    schemaVersion: "1.0.0-draft.1", contractKind: "execution-plan", routePlanId: input.routePlan.id, routePlanDigest: input.routePlan.digest,
    mode: "plan", status, fileChanges: stable(input.fileOperations ?? [], (v) => `${v.path}:${v.operation}`), dependencyChanges: stable(input.dependencies ?? [], (v) => `${v.workspace}:${v.package}:${v.operation}`),
    commands: stable(input.commands ?? [], (v) => v.argv.join("\u0000")), providers: stable(input.providers ?? [], (v) => v.id), contextReferences: stable(input.contextReferences, (v) => v.id),
    constraints: stable(input.constraints, (v) => v), verification: stable(input.verification ?? [], (v) => v), expectedArtifacts: stable(input.expectedArtifacts ?? [], (v) => v), rollback: stable(input.rollback ?? [], (v) => v), affectedScopes: stable(input.affectedScopes ?? [], (v) => v), risks: stable(input.risks ?? [], (v) => v), unresolvedInputs: unresolved, deniedSteps: denied,
    networkDestinations: stable((input.commands ?? []).filter((v) => v.networkRequired).map((v) => v.cwd), (v) => v), credentials: [], approval: { required: (input.permissions ?? []).length > 0, scopes: stable(input.permissions ?? [], (v) => v) }
  };
}
export class DeterministicExecutionPlanner implements ExecutionPlanner, PlanEvidenceProvider {
  readonly #plans = new Map<string, ExecutionPlan>();
  create(input: CreateExecutionPlanInput): ExecutionPlan {
    const semantic = normalize(input); const immutableDigest = digestJson(json(semantic)); const executionPlanId = `plan_${immutableDigest.slice(7, 31)}`;
    const plan: ExecutionPlan = { ...semantic, executionPlanId, immutableDigest, createdAt: input.createdAt ?? new Date(0).toISOString() };
    this.#plans.set(plan.executionPlanId, plan); return plan;
  }
  validate(plan: unknown): PlanValidationResult { const result = validateContract("execution-plan", plan); return result.ok ? { ok: true, issues: [] } : { ok: false, issues: result.issues.map((issue) => `${issue.instancePath} ${issue.message}`) }; }
  compare(plan: ExecutionPlan, current: PlanningInputs): PlanDriftReport { const expected = { projectSnapshot: plan.projectSnapshot, catalogSnapshot: plan.catalogSnapshot, policySnapshot: plan.policySnapshot, routePlan: plan.routePlan, contextReferences: plan.contextReferences, objective: plan.objective, constraints: plan.constraints, lockfile: plan.lockfile, runnerCapabilities: plan.runnerCapabilities }; const actual = { projectSnapshot: current.projectSnapshot, catalogSnapshot: current.catalogSnapshot, policySnapshot: current.policySnapshot, routePlan: current.routePlan, contextReferences: stable(current.contextReferences, (v) => v.id), objective: current.objective, constraints: stable(current.constraints, (v) => v), lockfile: current.lockfile, runnerCapabilities: current.runnerCapabilities }; const differences = Object.keys(expected).filter((key) => JSON.stringify(expected[key as keyof typeof expected]) !== JSON.stringify(actual[key as keyof typeof actual])); return { drifted: differences.length > 0, differences }; }
  getPlan(planId: string): ExecutionPlan | undefined { return this.#plans.get(planId); }
}
export interface ExecutionPlanner { create(input: CreateExecutionPlanInput): ExecutionPlan; validate(plan: unknown): PlanValidationResult; compare(plan: ExecutionPlan, current: PlanningInputs): PlanDriftReport; }
