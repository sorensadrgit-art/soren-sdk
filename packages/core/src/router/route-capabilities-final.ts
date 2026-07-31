import {
  assertContract,
  digestJson,
  type IntegrationArtifact,
  type JsonValue,
  type PolicyDocument,
  type ProjectSnapshot,
  type RoutePlan,
  type RouteRequest
} from "@soren-sdk/contracts";

import type {
  CatalogReader,
  ConnectorRecord,
  SchemaV2ConnectorRecord
} from "../catalog/types.js";
import {
  getPhase4CompanionIntegrationIds,
  PHASE_4_POLICY
} from "./policy.js";
import { routeCapabilities as routeCapabilitiesReviewed } from "./route-capabilities-reviewed.js";
import type { RouteInput } from "./types.js";

const RUNTIME_KINDS = new Set(["built-in", "runtime-package"]);
const DENIED_EXECUTION_RISKS = new Set([
  "command-execution",
  "network-and-command",
  "privileged",
  "project-write"
]);
const MOTION_REACT_CAPABILITIES = new Set([
  "interaction.drag",
  "interaction.gesture",
  "motion.layout",
  "motion.presence",
  "motion.shared-layout",
  "motion.spring"
]);
const SEMANTIC_VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const UNKNOWN_REACT_VERSION = "<unknown>";
const WORKSPACE_RESOLVABLE_FAILURES = new Set([
  "ENVIRONMENT_AMBIGUOUS",
  "ENVIRONMENT_UNSUPPORTED"
]);
const WAAPI_MINIMUMS: Readonly<Record<string, readonly [number, number]>> = {
  android: [84, 0],
  and_chr: [84, 0],
  and_ff: [75, 0],
  chrome: [84, 0],
  edge: [84, 0],
  firefox: [75, 0],
  ios_saf: [13, 4],
  op_mob: [64, 0],
  opera: [70, 0],
  safari: [13, 1],
  samsung: [12, 0]
};

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function isValidSemanticVersion(value: string): boolean {
  const match = SEMANTIC_VERSION.exec(value.trim());
  if (match === null) return false;
  const prerelease = match[4];
  if (prerelease === undefined) return true;
  return prerelease.split(".").every(
    (identifier) =>
      !/^\d+$/.test(identifier) ||
      identifier === "0" ||
      !identifier.startsWith("0")
  );
}

function browserQuery(target: string): string {
  const trimmed = target.trim();
  const environmentPrefix = /^[A-Za-z0-9_-]+:(.*)$/.exec(trimmed);
  return (environmentPrefix?.[1] ?? trimmed).trim();
}

function requiresBrowserslistResolution(clause: string): boolean {
  const normalized = clause.trim().toLowerCase();
  if (normalized === "defaults") return false;
  if (normalized === "dead") return true;
  if (normalized.includes("%")) return true;
  if (
    /^(?:cover\s|last\s+\d+\s+versions?$|since\s|maintained\s|current\s|unreleased\s)/.test(
      normalized
    )
  ) {
    return true;
  }
  return (
    /^[a-z][a-z0-9_-]*$/.test(normalized) &&
    !Object.hasOwn(WAAPI_MINIMUMS, normalized)
  );
}

function compareBrowserVersion(
  left: readonly [number, number],
  right: readonly [number, number]
): number {
  return left[0] - right[0] || left[1] - right[1];
}

function browserClauseProvablySupportsWaapi(clause: string): boolean {
  const normalized = clause.trim().toLowerCase();
  if (normalized === "defaults") return true;
  const match =
    /^(android|and_chr|and_ff|chrome|edge|firefox|ios_saf|op_mob|opera|safari|samsung)\s*(>=|>|=)?\s*(\d+)(?:\.(\d+))?(?:-\d+(?:\.\d+)?)?$/.exec(
      normalized
    );
  if (match === null) return false;
  const minimum = WAAPI_MINIMUMS[match[1] ?? ""];
  if (minimum === undefined) return false;
  const comparator = match[2] ?? "=";
  let lowerBound: [number, number] = [
    Number.parseInt(match[3] ?? "0", 10),
    Number.parseInt(match[4] ?? "0", 10)
  ];
  if (comparator === ">") {
    lowerBound =
      match[4] === undefined
        ? [lowerBound[0] + 1, 0]
        : [lowerBound[0], lowerBound[1] + 1];
  }
  return compareBrowserVersion(lowerBound, minimum) >= 0;
}

function normalizeBrowserTargets(project: ProjectSnapshot): ProjectSnapshot {
  const browsers = project.targets.browsers.flatMap((target) =>
    target
      .split(",")
      .map(browserQuery)
      .filter(
        (clause) =>
          clause.length > 0 && !clause.toLowerCase().startsWith("not ")
      )
      .map((clause) =>
        requiresBrowserslistResolution(clause) ||
        !browserClauseProvablySupportsWaapi(clause)
          ? "ie 11"
          : clause
      )
  );
  return {
    ...project,
    targets: {
      ...project.targets,
      browsers
    }
  };
}

function assertUniqueCapabilityIds(input: RouteInput): void {
  const seen = new Set<string>();
  for (const capability of input.request.capabilities) {
    if (seen.has(capability.id)) {
      throw new Error(
        `Duplicate capability ID "${capability.id}" is not allowed.`
      );
    }
    seen.add(capability.id);
  }
}

function requiredMotionCapabilities(request: RouteRequest) {
  return request.capabilities.filter(
    (capability) =>
      capability.required && MOTION_REACT_CAPABILITIES.has(capability.id)
  );
}

function requestedMotionWorkspace(request: RouteRequest): {
  workspace: string | null;
  ambiguous: boolean;
} {
  const workspaces = new Set(
    requiredMotionCapabilities(request)
      .map((capability) => capability.quality?.workspace)
      .filter(
        (workspace): workspace is string =>
          typeof workspace === "string" && workspace.trim().length > 0
      )
      .map((workspace) => workspace.trim())
  );
  return {
    workspace: workspaces.size === 1 ? [...workspaces][0] ?? null : null,
    ambiguous: workspaces.size > 1
  };
}

function workspaceExists(
  project: ProjectSnapshot,
  workspace: string | null
): boolean {
  return (
    workspace === null ||
    workspace === "." ||
    project.workspace.packages.some((item) => item.path === workspace)
  );
}

function reactWorkspaceVersions(project: ProjectSnapshot): Map<string, Set<string>> {
  const versions = new Map<string, Set<string>>();
  for (const item of [...project.dependencies, ...project.frameworks]) {
    if (item.name !== "react") continue;
    const workspace = item.workspace ?? ".";
    const existing = versions.get(workspace) ?? new Set<string>();
    existing.add(item.version ?? UNKNOWN_REACT_VERSION);
    versions.set(workspace, existing);
  }
  return versions;
}

function reactWorkspacesDisagree(project: ProjectSnapshot): boolean {
  const versions = reactWorkspaceVersions(project);
  if ([...versions.values()].some((value) => value.size > 1)) return true;
  return new Set(
    [...versions.values()].flatMap((value) => [...value])
  ).size > 1;
}

function selectReactWorkspace(
  project: ProjectSnapshot,
  workspace: string | null
): ProjectSnapshot {
  if (workspace === null) return project;
  return {
    ...project,
    dependencies: project.dependencies.filter(
      (dependency) =>
        dependency.name !== "react" || dependency.workspace === workspace
    ),
    frameworks: project.frameworks.filter(
      (framework) =>
        framework.name !== "react" || framework.workspace === workspace
    )
  };
}

function workspaceNeedsInputPlan(initial: RoutePlan): RoutePlan {
  const stablePayload = {
    schemaVersion: initial.schemaVersion,
    contractKind: initial.contractKind,
    status: "needs-input" as const,
    requestId: initial.requestId,
    projectSnapshotId: initial.projectSnapshotId,
    catalogSnapshotId: initial.catalogSnapshotId,
    policySnapshotId: initial.policySnapshotId,
    requestedCapabilities: initial.requestedCapabilities,
    selectedProviders: [],
    rejectedProviders: [
      {
        providerId: "motion",
        reasonCode: "ENVIRONMENT_UNSUPPORTED",
        reason:
          "The target workspace is missing, invalid, or has unresolved React compatibility."
      }
    ],
    ownership: [],
    constraints: [
      {
        code: "ENVIRONMENT_AMBIGUOUS",
        status: "failed" as const,
        message:
          "Provide a valid quality.workspace for the required React-dependent Motion capability."
      }
    ],
    uncertainty: 1,
    requiredInput: ["target workspace"]
  };
  const digest = digestJson(json(stablePayload));
  const plan: RoutePlan = {
    ...stablePayload,
    planId: `route_${digest.slice("sha256:".length, "sha256:".length + 24)}`,
    createdAt: initial.createdAt,
    digest
  };
  assertContract<RoutePlan>("route-plan", plan);
  return plan;
}

function hasHardWorkspaceFailure(plan: RoutePlan): boolean {
  if (plan.status !== "blocked") return false;
  return plan.constraints.some(
    (constraint) =>
      constraint.status === "failed" &&
      !WORKSPACE_RESOLVABLE_FAILURES.has(constraint.code)
  );
}

function pluginDependentSvgRequest(request: RouteRequest): boolean {
  const svg = request.capabilities.find(
    (capability) => capability.required && capability.id === "motion.svg"
  );
  if (svg === undefined) return false;
  const values = Object.entries(svg.quality ?? {})
    .flatMap(([key, value]) => {
      if (value === false || value === 0 || value === "") return [];
      return [key, typeof value === "string" ? value : String(value)];
    })
    .join(" ")
    .toLowerCase();
  return /\b(?:draw(?:svg(?:plugin)?)?|morph(?:svg(?:plugin)?)?|path[- ]?morph|path[- ]?drawing)\b/.test(
    values
  );
}

function normalizedHost(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.includes("://")) {
    try {
      return new URL(trimmed).hostname.replace(/\.$/, "");
    } catch {
      return trimmed;
    }
  }
  return trimmed.replace(/\.$/, "");
}

function runtimeEligible(
  integration: IntegrationArtifact,
  request: RouteRequest,
  policy: PolicyDocument
): boolean {
  if (integration.status !== "available" || integration.mode !== "runtime") {
    return false;
  }
  if (!RUNTIME_KINDS.has(integration.kind)) return false;
  if (
    integration.kind === "runtime-package" &&
    (integration.version.status !== "resolved" ||
      integration.version.value === undefined ||
      !isValidSemanticVersion(integration.version.value))
  ) {
    return false;
  }
  if (integration.version.status === "unresolved") return false;
  if (integration.authorization.required) return false;
  if (
    policy.rules.maxBundleKilobytes !== null &&
    integration.kind === "runtime-package"
  ) {
    return false;
  }
  if (
    integration.licenseExpression === undefined ||
    !policy.rules.allowedLicenses.includes(integration.licenseExpression)
  ) {
    return false;
  }
  if (
    integration.authorization.paidPlan &&
    !(policy.rules.allowPaidServices && request.preferences.allowPaidServices)
  ) {
    return false;
  }
  if (DENIED_EXECUTION_RISKS.has(integration.executionRisk)) return false;
  if (integration.permissions.projectWrite) return false;
  if (integration.permissions.filesystem !== "none") return false;
  if (
    policy.rules.network.mode === "deny" &&
    integration.permissions.network.length > 0
  ) {
    return false;
  }
  if (policy.rules.network.mode === "allowlist") {
    const allowedHosts = new Set(
      policy.rules.network.allowedHosts.map(normalizedHost)
    );
    if (
      integration.permissions.network.some(
        (host) => !allowedHosts.has(normalizedHost(host))
      )
    ) {
      return false;
    }
  }
  return !(
    integration.dataExposure === "remote-project-content" &&
    !policy.rules.allowRemoteProjectContent
  );
}

function filterRouteIneligibleRuntimes(
  record: SchemaV2ConnectorRecord,
  request: RouteRequest,
  policy: PolicyDocument
): SchemaV2ConnectorRecord {
  let integrations = record.manifest.integrations.map((integration) =>
    integration.mode === "runtime" &&
    !runtimeEligible(integration, request, policy)
      ? { ...integration, status: "unverified" as const }
      : integration
  );

  const companionIds = getPhase4CompanionIntegrationIds(
    record.manifest.connector.id
  );
  const hasEligibleBaseRuntime = integrations.some(
    (integration) =>
      integration.mode === "runtime" &&
      integration.status === "available" &&
      RUNTIME_KINDS.has(integration.kind) &&
      !companionIds.has(integration.id)
  );
  if (!hasEligibleBaseRuntime) {
    integrations = integrations.map((integration) =>
      integration.mode === "runtime"
        ? { ...integration, status: "unverified" as const }
        : integration
    );
  }

  const capabilityClaims =
    record.manifest.connector.id === "gsap" && pluginDependentSvgRequest(request)
      ? record.manifest.capabilityClaims.filter(
          (claim) => claim.capability !== "motion.svg"
        )
      : record.manifest.capabilityClaims;

  return {
    ...record,
    manifest: {
      ...record.manifest,
      integrations,
      capabilityClaims
    }
  };
}

function filteredRecord(
  record: ConnectorRecord,
  request: RouteRequest,
  policy: PolicyDocument
): ConnectorRecord {
  return record.kind === "schema-v2"
    ? filterRouteIneligibleRuntimes(record, request, policy)
    : record;
}

function routeCatalog(
  catalog: CatalogReader,
  request: RouteRequest,
  policy: PolicyDocument
): CatalogReader {
  return {
    getCapabilityCatalog() {
      return catalog.getCapabilityCatalog();
    },
    list() {
      return catalog.list().map((record) =>
        filteredRecord(record, request, policy)
      );
    },
    get(connectorId) {
      const record = catalog.get(connectorId);
      return record === undefined
        ? undefined
        : filteredRecord(record, request, policy);
    },
    health(connectorId) {
      return catalog.health(connectorId);
    },
    snapshot(createdAt) {
      return catalog.snapshot(createdAt);
    }
  };
}

export function routeCapabilities(input: RouteInput) {
  assertContract<RouteRequest>("route-request", input.request);
  assertContract<ProjectSnapshot>("project-snapshot", input.project);
  const policy = input.policy ?? PHASE_4_POLICY;
  assertContract<PolicyDocument>("policy", policy);
  assertUniqueCapabilityIds(input);

  const workspace = requestedMotionWorkspace(input.request);
  const motionRequired = requiredMotionCapabilities(input.request).length > 0;
  const workspaceKnown = workspaceExists(input.project, workspace.workspace);
  const workspaceNeedsInput =
    motionRequired &&
    (workspace.ambiguous ||
      !workspaceKnown ||
      (workspace.workspace === null && reactWorkspacesDisagree(input.project)));
  const effectiveWorkspace = workspaceKnown ? workspace.workspace : null;
  const project = normalizeBrowserTargets(
    selectReactWorkspace(input.project, effectiveWorkspace)
  );
  const initial = routeCapabilitiesReviewed({
    ...input,
    policy,
    project,
    catalog: routeCatalog(input.catalog, input.request, policy)
  });

  return workspaceNeedsInput && !hasHardWorkspaceFailure(initial)
    ? workspaceNeedsInputPlan(initial)
    : initial;
}
