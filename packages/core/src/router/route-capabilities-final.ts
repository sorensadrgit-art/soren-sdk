import {
  assertContract,
  type IntegrationArtifact,
  type PolicyDocument,
  type ProjectSnapshot,
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
    !new Set([
      "android",
      "and_chr",
      "and_ff",
      "and_qq",
      "and_uc",
      "baidu",
      "bb",
      "chrome",
      "edge",
      "firefox",
      "ie",
      "ie_mob",
      "ios_saf",
      "kaios",
      "node",
      "op_mini",
      "op_mob",
      "opera",
      "safari",
      "samsung"
    ]).has(normalized)
  );
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
        requiresBrowserslistResolution(clause) ? "ie 11" : clause
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
  if (integration.version.status === "unresolved") return false;
  if (integration.authorization.required) return false;
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

  return {
    ...record,
    manifest: {
      ...record.manifest,
      integrations
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

  return routeCapabilitiesReviewed({
    ...input,
    policy,
    project: normalizeBrowserTargets(input.project),
    catalog: routeCatalog(input.catalog, input.request, policy)
  });
}
