import {
  canonicalJson,
  digestJson,
  validateContract,
  type Digest,
  type ExecutionPlan as ContractExecutionPlan,
  type JsonValue
} from "@soren-sdk/contracts";

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
  dependencies?: Array<{
    operation: "add" | "remove" | "update";
    workspace: string;
    package: string;
    version: string | null;
    kind: "dependency" | "devDependency" | "optionalDependency" | "peerDependency";
    reason: string;
  }>;
  fileOperations?: Array<{
    operation: "create" | "update" | "delete";
    path: string;
    contentDigest: Digest | null;
  }>;
  commands?: Array<{
    argv: string[];
    cwd: string;
    timeoutSeconds: number;
    networkRequired: boolean;
  }>;
  networkDestinations?: string[];
  permissions?: Array<
    "command-execution" | "credential-use" | "network" | "project-write" | "release"
  >;
  verification?: string[];
  expectedArtifacts?: string[];
  rollback?: string[];
  affectedScopes?: string[];
  risks?: string[];
  unresolvedInputs?: string[];
  deniedSteps?: string[];
}

export interface ExecutionPlan extends ContractExecutionPlan {
  projectSnapshot: Digest;
  catalogSnapshot: Digest;
  policySnapshot: Digest;
  routePlan: { id: string; digest: Digest };
  contextReferences: Array<{ id: string; digest: Digest }>;
  objective: string;
  constraints: string[];
  status: PlanStatus;
  providers: Array<{ id: string; integrations: string[] }>;
  expectedArtifacts: string[];
  affectedScopes: string[];
  risks: string[];
  unresolvedInputs: string[];
  deniedSteps: string[];
  lockfile?: { id: string; digest: Digest };
  runnerCapabilities?: Record<string, JsonValue>;
}

export interface PlanValidationResult {
  ok: boolean;
  issues: string[];
}

export interface PlanDriftReport {
  drifted: boolean;
  differences: string[];
}

export interface PlanEvidenceProvider {
  getPlan(planId: string): ExecutionPlan | undefined;
}

export interface ExecutionPlanner {
  create(input: CreateExecutionPlanInput): ExecutionPlan;
  validate(plan: unknown): PlanValidationResult;
  compare(plan: ExecutionPlan, current: PlanningInputs): PlanDriftReport;
}

const SENSITIVE_TEXT = /(api[_-]?key|password|secret|token|private[_-]?key)/i;
const ARRAY_INDEX = /^(0|[1-9][0-9]*)$/u;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function stable<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((left, right) => key(left).localeCompare(key(right)));
}

function stableStrings(items: readonly string[]): string[] {
  return [...new Set(items)].sort();
}

function assertSafe(value: unknown, path = "input", seen = new WeakSet<object>()): void {
  if (typeof value === "string" && SENSITIVE_TEXT.test(value)) {
    throw new Error(`Secret-like data is forbidden at ${path}.`);
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!descriptor.enumerable || (Array.isArray(value) && key === "length")) continue;
    if ((!Array.isArray(value) || !ARRAY_INDEX.test(key)) && SENSITIVE_TEXT.test(key)) {
      throw new Error(`Secret-like field is forbidden at ${path}.${key}.`);
    }
    if ("value" in descriptor) {
      const childPath = Array.isArray(value) && ARRAY_INDEX.test(key) ? `${path}[${key}]` : `${path}.${key}`;
      assertSafe(descriptor.value, childPath, seen);
    }
  }
  seen.delete(value);
}

function invalidJson(path: string): never {
  throw new TypeError(`Value at ${path} is not valid JSON.`);
}

function validateJsonValue(value: unknown, path: string): JsonValue {
  assertSafe(value, path);
  return validateJsonValueInternal(value, path, new WeakSet<object>());
}

function validateJsonValueInternal(
  value: unknown,
  path: string,
  seen: WeakSet<object>
): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalidJson(path);
    return value;
  }
  if (typeof value !== "object") invalidJson(path);
  if (seen.has(value)) invalidJson(path);
  seen.add(value);

  if (Array.isArray(value)) {
    const result: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !("value" in descriptor)) invalidJson(`${path}[${index}]`);
      result.push(validateJsonValueInternal(descriptor.value, `${path}[${index}]`, seen));
    }
    for (const key of Object.keys(value)) {
      if (!ARRAY_INDEX.test(key) || Number(key) >= value.length) invalidJson(`${path}.${key}`);
    }
    seen.delete(value);
    return result;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalidJson(path);
  const result: Record<string, JsonValue> = Object.create(null);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!descriptor.enumerable) continue;
    if (DANGEROUS_KEYS.has(key) || !("value" in descriptor)) invalidJson(`${path}.${key}`);
    result[key] = validateJsonValueInternal(descriptor.value, `${path}.${key}`, seen);
  }
  seen.delete(value);
  return result;
}

function normalizeRunnerCapabilities(value: unknown, path: string): Record<string, JsonValue> {
  const normalized = validateJsonValue(value, path);
  if (normalized === null || Array.isArray(normalized) || typeof normalized !== "object") invalidJson(path);
  return normalized;
}

function normalizeComparisonRunnerCapabilities(value: unknown, path: string): JsonValue {
  return validateJsonValue(value, path);
}

function normalizeProviders(
  providers: readonly { id: string; integrations: string[] }[]
): Array<{ id: string; integrations: string[] }> {
  return stable(
    providers.map((provider) => ({
      id: provider.id,
      integrations: stableStrings(provider.integrations)
    })),
    (provider) => provider.id
  );
}

function normalizeRoutePlan(routePlan: { id: string; digest: Digest }): { id: string; digest: Digest } {
  return { ...routePlan };
}

function normalizeContextReferences(
  references: readonly { id: string; digest: Digest }[]
): Array<{ id: string; digest: Digest }> {
  return stable(references.map((reference) => ({ ...reference })), (reference) => reference.id);
}

function normalizeConstraints(constraints: readonly string[]): string[] {
  return stableStrings(constraints);
}

function normalizeLockfile(lockfile: { id: string; digest: Digest }): { id: string; digest: Digest } {
  return { ...lockfile };
}

type SemanticExecutionPlan = Omit<
  ExecutionPlan,
  "createdAt" | "executionPlanId" | "immutableDigest"
>;

function semanticPlan(input: CreateExecutionPlanInput): SemanticExecutionPlan {
  assertSafe(input);
  const unresolvedInputs = stableStrings(input.unresolvedInputs ?? []);
  const deniedSteps = stableStrings(input.deniedSteps ?? []);
  const status: PlanStatus =
    deniedSteps.length > 0
      ? "blocked"
      : unresolvedInputs.length > 0 || input.objective.trim() === ""
        ? "needs-input"
        : "ready";
  const permissions = stableStrings(
    input.permissions ?? []
  ) as ExecutionPlan["approval"]["scopes"];

  return {
    schemaVersion: "1.0.0-draft.1",
    contractKind: "execution-plan",
    routePlanId: input.routePlan.id,
    mode: "plan",
    fileChanges: stable(
      input.fileOperations ?? [],
      (operation) => `${operation.path}\u0000${operation.operation}`
    ),
    dependencyChanges: stable(
      input.dependencies ?? [],
      (dependency) =>
        `${dependency.workspace}\u0000${dependency.package}\u0000${dependency.operation}`
    ),
    commands: stable(
      input.commands ?? [],
      (command) => `${command.cwd}\u0000${command.argv.join("\u0000")}`
    ),
    networkDestinations: stableStrings(input.networkDestinations ?? []),
    credentials: [],
    rollback: stableStrings(input.rollback ?? []),
    verification: stableStrings(input.verification ?? []),
    approval: {
      required: permissions.length > 0,
      scopes: permissions
    },
    projectSnapshot: input.projectSnapshot,
    catalogSnapshot: input.catalogSnapshot,
    policySnapshot: input.policySnapshot,
    routePlan: normalizeRoutePlan(input.routePlan),
    contextReferences: normalizeContextReferences(input.contextReferences),
    objective: input.objective,
    constraints: normalizeConstraints(input.constraints),
    status,
    providers: normalizeProviders(input.providers ?? []),
    expectedArtifacts: stableStrings(input.expectedArtifacts ?? []),
    affectedScopes: stableStrings(input.affectedScopes ?? []),
    risks: stableStrings(input.risks ?? []),
    unresolvedInputs,
    deniedSteps,
    ...(input.lockfile === undefined ? {} : { lockfile: normalizeLockfile(input.lockfile) }),
    ...(input.runnerCapabilities === undefined
      ? {}
      : {
          runnerCapabilities: normalizeRunnerCapabilities(
            input.runnerCapabilities,
            "input.runnerCapabilities"
          )
        })
  };
}

function semanticPlanFromPlan(plan: ExecutionPlan): SemanticExecutionPlan {
  const semantic = { ...plan } as Partial<ExecutionPlan>;
  delete semantic.createdAt;
  delete semantic.executionPlanId;
  delete semantic.immutableDigest;
  return semantic as SemanticExecutionPlan;
}

function expectedPlanId(digest: Digest): string {
  return `plan_${digest.slice("sha256:".length, "sha256:".length + 24)}`;
}

function comparisonRecord(input: PlanningInputs, side: "plan" | "current"): Record<string, JsonValue> {
  return {
    projectSnapshot: input.projectSnapshot,
    catalogSnapshot: input.catalogSnapshot,
    policySnapshot: input.policySnapshot,
    routePlan: normalizeRoutePlan(input.routePlan),
    contextReferences: normalizeContextReferences(input.contextReferences),
    objective: input.objective,
    constraints: normalizeConstraints(input.constraints),
    ...(input.lockfile === undefined ? {} : { lockfile: normalizeLockfile(input.lockfile) }),
    ...(input.runnerCapabilities === undefined
      ? {}
      : {
          runnerCapabilities: normalizeComparisonRunnerCapabilities(
            input.runnerCapabilities,
            `${side}.runnerCapabilities`
          )
        })
  };
}

function sameJson(left: JsonValue, right: JsonValue): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export class DeterministicExecutionPlanner
  implements ExecutionPlanner, PlanEvidenceProvider
{
  readonly #plans = new Map<string, ExecutionPlan>();

  create(input: CreateExecutionPlanInput): ExecutionPlan {
    const semantic = semanticPlan(input);
    const immutableDigest = digestJson(validateJsonValue(semantic, "plan"));
    const executionPlanId = expectedPlanId(immutableDigest);
    const plan: ExecutionPlan = {
      ...semantic,
      executionPlanId,
      immutableDigest,
      createdAt: input.createdAt ?? new Date(0).toISOString()
    };
    const validation = this.validate(plan);
    if (!validation.ok) {
      throw new Error(
        `Generated execution plan is invalid: ${validation.issues.join("; ")}`
      );
    }
    this.#plans.set(plan.executionPlanId, plan);
    return plan;
  }

  validate(plan: unknown): PlanValidationResult {
    const result = validateContract<ContractExecutionPlan>(
      "execution-plan",
      plan
    );
    if (!result.ok) {
      return {
        ok: false,
        issues: result.issues.map(
          (issue) => `${issue.instancePath || "/"} ${issue.message}`
        )
      };
    }

    const candidate = result.value as ExecutionPlan;
    const recomputed = digestJson(validateJsonValue(semanticPlanFromPlan(candidate), "plan"));
    const issues: string[] = [];
    if (candidate.immutableDigest !== recomputed) {
      issues.push(
        `immutableDigest does not match the recomputed digest ${recomputed}`
      );
    }
    const id = expectedPlanId(candidate.immutableDigest);
    if (candidate.executionPlanId !== id) {
      issues.push(`executionPlanId does not match digest-derived id ${id}`);
    }
    return { ok: issues.length === 0, issues };
  }

  compare(plan: ExecutionPlan, current: PlanningInputs): PlanDriftReport {
    const expected = comparisonRecord(plan, "plan");
    const actual = comparisonRecord(current, "current");
    const differences = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].filter((key) => {
      if (!(key in expected) || !(key in actual)) return true;
      const field = key as keyof typeof expected;
      const expectedValue = expected[field];
      const actualValue = actual[field];
      if (expectedValue === undefined || actualValue === undefined) return true;
      return !sameJson(expectedValue, actualValue);
    });
    return { drifted: differences.length > 0, differences };
  }

  getPlan(planId: string): ExecutionPlan | undefined {
    return this.#plans.get(planId);
  }
}
