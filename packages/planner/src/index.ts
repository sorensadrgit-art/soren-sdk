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

function stable<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((left, right) => key(left).localeCompare(key(right)));
}

function stableStrings(items: readonly string[]): string[] {
  return [...new Set(items)].sort();
}

function json(value: unknown): JsonValue {
  return value as JsonValue;
}

function assertSafe(value: unknown, path = "input"): void {
  if (typeof value === "string" && SENSITIVE_TEXT.test(value)) {
    throw new Error(`Sensitive-looking data is forbidden at ${path}.`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafe(entry, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      if (SENSITIVE_TEXT.test(key)) {
        throw new Error(`Sensitive-looking field is forbidden at ${path}.${key}.`);
      }
      assertSafe(entry, `${path}.${key}`);
    });
  }
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
    routePlan: { ...input.routePlan },
    contextReferences: stable(
      input.contextReferences.map((reference) => ({ ...reference })),
      (reference) => reference.id
    ),
    objective: input.objective,
    constraints: stableStrings(input.constraints),
    status,
    providers: normalizeProviders(input.providers ?? []),
    expectedArtifacts: stableStrings(input.expectedArtifacts ?? []),
    affectedScopes: stableStrings(input.affectedScopes ?? []),
    risks: stableStrings(input.risks ?? []),
    unresolvedInputs,
    deniedSteps,
    ...(input.lockfile === undefined ? {} : { lockfile: { ...input.lockfile } }),
    ...(input.runnerCapabilities === undefined
      ? {}
      : { runnerCapabilities: input.runnerCapabilities })
  };
}

function semanticPlanFromPlan(plan: ExecutionPlan): SemanticExecutionPlan {
  const {
    createdAt: _createdAt,
    executionPlanId: _executionPlanId,
    immutableDigest: _immutableDigest,
    ...semantic
  } = plan;
  return semantic;
}

function expectedPlanId(digest: Digest): string {
  return `plan_${digest.slice("sha256:".length, "sha256:".length + 24)}`;
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(json(left)) === canonicalJson(json(right));
}

export class DeterministicExecutionPlanner
  implements ExecutionPlanner, PlanEvidenceProvider
{
  readonly #plans = new Map<string, ExecutionPlan>();

  create(input: CreateExecutionPlanInput): ExecutionPlan {
    const semantic = semanticPlan(input);
    const immutableDigest = digestJson(json(semantic));
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
    const recomputed = digestJson(json(semanticPlanFromPlan(candidate)));
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
    const expected = {
      projectSnapshot: plan.projectSnapshot,
      catalogSnapshot: plan.catalogSnapshot,
      policySnapshot: plan.policySnapshot,
      routePlan: plan.routePlan,
      contextReferences: plan.contextReferences,
      objective: plan.objective,
      constraints: plan.constraints,
      lockfile: plan.lockfile,
      runnerCapabilities: plan.runnerCapabilities
    };
    const actual = {
      projectSnapshot: current.projectSnapshot,
      catalogSnapshot: current.catalogSnapshot,
      policySnapshot: current.policySnapshot,
      routePlan: current.routePlan,
      contextReferences: stable(
        current.contextReferences,
        (reference) => reference.id
      ),
      objective: current.objective,
      constraints: stableStrings(current.constraints),
      lockfile: current.lockfile,
      runnerCapabilities: current.runnerCapabilities
    };
    const differences = Object.keys(expected).filter((key) => {
      const field = key as keyof typeof expected;
      return !sameJson(expected[field], actual[field]);
    });
    return { drifted: differences.length > 0, differences };
  }

  getPlan(planId: string): ExecutionPlan | undefined {
    return this.#plans.get(planId);
  }
}
