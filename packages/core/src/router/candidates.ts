import type {
  IntegrationArtifact,
  PolicyDocument,
  ProjectSnapshot,
  RouteRequest
} from "@soren-sdk/contracts";

import type { CatalogReader, ConnectorRecord } from "../catalog/types.js";
import type {
  ProviderCandidate,
  ProviderRejection,
  RouteReasonCode
} from "./types.js";

const PHASE_PROVIDER_IDS = new Set(["gsap", "motion", "web-platform"]);
const RUNTIME_KINDS = new Set(["built-in", "runtime-package"]);
const DENIED_EXECUTION_RISKS = new Set([
  "command-execution",
  "network-and-command",
  "privileged",
  "project-write"
]);

interface CandidateCollectionInput {
  catalog: CatalogReader;
  project: ProjectSnapshot;
  request: RouteRequest;
  policy: PolicyDocument;
  requiredCapabilityIds: ReadonlySet<string>;
}

export interface CandidateCollection {
  candidates: ProviderCandidate[];
  rejections: ProviderRejection[];
}

function providerId(record: ConnectorRecord): string {
  return record.kind === "schema-v2"
    ? record.manifest.connector.id
    : record.directoryId;
}

function reject(
  providerIdValue: string,
  reasonCode: RouteReasonCode,
  reason: string
): ProviderRejection {
  return { providerId: providerIdValue, reasonCode, reason };
}

function parseSemver(value: string | null | undefined): [number, number, number] | null {
  if (value === null || value === undefined) return null;
  const match = /(?:^|[^0-9])(\d+)\.(\d+)(?:\.(\d+))?/.exec(value);
  if (match === null) return null;
  return [
    Number.parseInt(match[1] ?? "0", 10),
    Number.parseInt(match[2] ?? "0", 10),
    Number.parseInt(match[3] ?? "0", 10)
  ];
}

function atLeast(
  actual: [number, number, number],
  minimum: [number, number, number]
): boolean {
  for (let index = 0; index < actual.length; index += 1) {
    const actualPart = actual[index] ?? 0;
    const minimumPart = minimum[index] ?? 0;
    if (actualPart > minimumPart) return true;
    if (actualPart < minimumPart) return false;
  }
  return true;
}

function reactVersion(project: ProjectSnapshot): [number, number, number] | null {
  const dependency = project.dependencies.find(
    (item) => item.name === "react"
  )?.version;
  const framework = project.frameworks.find(
    (item) => item.name === "react"
  )?.version;
  return parseSemver(dependency ?? framework);
}

function integrationAllowed(
  integration: IntegrationArtifact,
  request: RouteRequest,
  policy: PolicyDocument
): boolean {
  if (integration.status !== "available" || integration.mode !== "runtime") {
    return false;
  }
  if (!RUNTIME_KINDS.has(integration.kind)) return false;
  if (integration.version.status === "unresolved") return false;
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
  if (
    integration.dataExposure === "remote-project-content" &&
    !policy.rules.allowRemoteProjectContent
  ) {
    return false;
  }
  return true;
}

function hasRelevantClaim(
  record: Extract<ConnectorRecord, { kind: "schema-v2" }>,
  requiredCapabilityIds: ReadonlySet<string>
): boolean {
  return record.manifest.capabilityClaims.some((claim) =>
    requiredCapabilityIds.has(claim.capability)
  );
}

function hasDependencyReuse(
  record: Extract<ConnectorRecord, { kind: "schema-v2" }>,
  project: ProjectSnapshot
): boolean {
  const installed = new Set(project.dependencies.map((item) => item.name));
  const packageNames = record.manifest.integrations
    .map((integration) => integration.packageName)
    .filter((name): name is string => name !== undefined);
  return [...packageNames, ...record.manifest.product.aliases].some((name) =>
    installed.has(name)
  );
}

function hardConstraintFailure(
  record: Extract<ConnectorRecord, { kind: "schema-v2" }>,
  input: CandidateCollectionInput
): ProviderRejection | null {
  const id = record.manifest.connector.id;
  const { request, policy } = input;

  if (!PHASE_PROVIDER_IDS.has(id) || !policy.rules.allowedConnectors.includes(id)) {
    return reject(id, "POLICY_DENIED", `Provider "${id}" is outside the Phase 4 allowlist.`);
  }
  if (
    policy.rules.deniedConnectors.includes(id) ||
    request.preferences.forbiddenProviders.includes(id)
  ) {
    return reject(id, "FORBIDDEN_PROVIDER", `Provider "${id}" is forbidden for this route.`);
  }

  const health = input.catalog.health(id);
  if (
    health.state !== "healthy" ||
    !health.selectable ||
    !record.selectable ||
    !record.manifest.connector.selectable
  ) {
    return reject(
      id,
      "CONNECTOR_UNHEALTHY",
      `Provider "${id}" is not a healthy selectable Connector Manifest v2 record.`
    );
  }

  if (
    record.manifest.connector.reviewStatus === "experimental" &&
    !(policy.rules.allowExperimental && request.preferences.allowExperimental)
  ) {
    return reject(id, "POLICY_DENIED", `Experimental provider "${id}" is not allowed.`);
  }

  if (!hasRelevantClaim(record, input.requiredCapabilityIds)) {
    return reject(
      id,
      "CAPABILITY_NOT_SUPPORTED",
      `Provider "${id}" does not claim a required capability.`
    );
  }

  if (id === "motion") {
    const version = reactVersion(input.project);
    if (version === null || !atLeast(version, [18, 2, 0])) {
      return reject(
        id,
        "ENVIRONMENT_UNSUPPORTED",
        "Motion React capabilities require React 18.2 or newer."
      );
    }
  }

  const runtimeIntegrations = record.manifest.integrations.filter((integration) =>
    integrationAllowed(integration, request, policy)
  );
  if (runtimeIntegrations.length === 0) {
    return reject(
      id,
      "POLICY_DENIED",
      `Provider "${id}" has no policy-approved available runtime integration.`
    );
  }

  return null;
}

export function collectProviderCandidates(
  input: CandidateCollectionInput
): CandidateCollection {
  const candidates: ProviderCandidate[] = [];
  const rejections: ProviderRejection[] = [];
  const records = [...input.catalog.list()].sort((left, right) =>
    providerId(left).localeCompare(providerId(right))
  );

  for (const record of records) {
    const id = providerId(record);
    if (!PHASE_PROVIDER_IDS.has(id)) continue;
    if (record.kind !== "schema-v2") {
      rejections.push(
        reject(id, "CONNECTOR_UNHEALTHY", `Provider "${id}" is a legacy connector and cannot be selected.`)
      );
      continue;
    }

    const failure = hardConstraintFailure(record, input);
    if (failure !== null) {
      rejections.push(failure);
      continue;
    }

    const claims = new Map(
      record.manifest.capabilityClaims.map((claim) => [claim.capability, claim])
    );
    const integrationIds = record.manifest.integrations
      .filter((integration) =>
        integrationAllowed(integration, input.request, input.policy)
      )
      .map((integration) => integration.id)
      .sort();
    const rank = input.request.preferences.preferredProviders.indexOf(id);
    candidates.push({
      providerId: id,
      manifest: record.manifest,
      integrationIds,
      claims,
      dependencyReuse: hasDependencyReuse(record, input.project),
      preferredRank: rank < 0 ? null : rank
    });
  }

  return {
    candidates: candidates.sort((left, right) =>
      left.providerId.localeCompare(right.providerId)
    ),
    rejections: rejections.sort((left, right) =>
      left.providerId.localeCompare(right.providerId)
    )
  };
}
