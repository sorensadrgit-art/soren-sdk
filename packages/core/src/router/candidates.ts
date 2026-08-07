import type {
  CapabilityCatalog,
  CatalogSnapshot,
  ConnectorManifest,
  ProjectSnapshot,
  RouteRequest
} from "@soren-sdk/contracts";

import type {
  CatalogReader,
  SchemaV2ConnectorRecord
} from "../catalog/types.js";
import type { ActiveRoutingPolicy } from "./types.js";
import { isAtLeast, type VersionTuple } from "./semver.js";

export { isAtLeast, minimumDeclaredVersion } from "./semver.js";

export type Phase4ProviderId = "gsap" | "motion" | "web-platform";

export interface CandidateClaim {
  capabilityId: string;
  support: "primary" | "secondary" | "fallback";
  confidence: number;
  environmentSupported: boolean;
  environmentReason?: string;
}

export interface ProviderCandidate {
  providerId: Phase4ProviderId;
  native: boolean;
  manifest: ConnectorManifest;
  runtimeIntegrationIds: string[];
  installed: boolean;
  legacyAliasPresent: boolean;
  claims: CandidateClaim[];
}

export interface CandidateRejection {
  providerId: Phase4ProviderId;
  reasonCode:
    | "CAPABILITY_NOT_SUPPORTED"
    | "CONNECTOR_UNHEALTHY"
    | "FORBIDDEN_PROVIDER"
    | "LICENSE_DENIED"
    | "PAID_ARTIFACT_DENIED"
    | "POLICY_DENIED"
    | "RUNTIME_ARTIFACT_UNAVAILABLE";
  reason: string;
}

export interface CandidateBuildInput {
  request: RouteRequest;
  project: ProjectSnapshot;
  catalog: CatalogReader;
  policy: ActiveRoutingPolicy;
}

export interface CandidateBuildResult {
  candidates: ProviderCandidate[];
  rejections: CandidateRejection[];
  capabilityCatalog: CapabilityCatalog;
  catalogSnapshot: CatalogSnapshot;
}

const PROVIDERS: readonly Phase4ProviderId[] = [
  "gsap",
  "motion",
  "web-platform"
];
const MOTION_REACT_MINIMUM: VersionTuple = [18, 2, 0];

function stableRejections(
  rejections: CandidateRejection[]
): CandidateRejection[] {
  return rejections.sort((left, right) => {
    let cmp = left.providerId.localeCompare(right.providerId);
    if (cmp !== 0) return cmp;
    cmp = left.reasonCode.localeCompare(right.reasonCode);
    if (cmp !== 0) return cmp;
    return left.reason.localeCompare(right.reason);
  });
}

function dependencyVersions(
  project: ProjectSnapshot,
  packageName: string
): string[] {
  return project.dependencies
    .filter((dependency) => dependency.name === packageName)
    .map((dependency) => dependency.version)
    .sort();
}

function motionEnvironment(project: ProjectSnapshot): {
  supported: boolean;
  reason?: string;
} {
  const ranges = dependencyVersions(project, "react");
  if (ranges.length === 0) {
    return {
      supported: false,
      reason: "Motion React claims require a declared React dependency of 18.2 or newer."
    };
  }
  for (const range of ranges) {
    if (isAtLeast(range, MOTION_REACT_MINIMUM) !== true) {
      return {
        supported: false,
        reason: `React declaration ${range} cannot prove Motion's 18.2 minimum.`
      };
    }
  }
  return { supported: true };
}

function isApprovedRecord(
  record: ReturnType<CatalogReader["get"]>
): record is SchemaV2ConnectorRecord {
  return (
    record?.kind === "schema-v2" &&
    record.selectable &&
    ["approved", "stable"].includes(record.manifest.connector.reviewStatus)
  );
}

function runtimeIntegrations(
  providerId: Phase4ProviderId,
  manifest: ConnectorManifest
): ConnectorManifest["integrations"] {
  return manifest.integrations.filter((integration) => {
    if (integration.status !== "available" || integration.mode !== "runtime") {
      return false;
    }
    return providerId === "web-platform"
      ? integration.kind === "built-in"
      : integration.kind === "runtime-package";
  });
}

function policyAllowsRuntime(
  integrations: ConnectorManifest["integrations"],
  input: CandidateBuildInput
): CandidateRejection["reasonCode"] | null {
  for (const integration of integrations) {
    if (
      integration.licenseExpression === undefined ||
      !input.policy.document.rules.allowedLicenses.includes(
        integration.licenseExpression
      )
    ) {
      return "LICENSE_DENIED";
    }
    if (
      integration.authorization.paidPlan &&
      (!input.policy.document.rules.allowPaidServices ||
        !input.request.preferences.allowPaidServices)
    ) {
      return "PAID_ARTIFACT_DENIED";
    }
    if (
      integration.permissions.projectWrite ||
      integration.permissions.network.length > 0 ||
      [
        "command-execution",
        "network-and-command",
        "privileged",
        "project-write"
      ].includes(integration.executionRisk)
    ) {
      return "POLICY_DENIED";
    }
  }
  return null;
}

export function buildProviderCandidates(
  input: CandidateBuildInput
): CandidateBuildResult {
  const candidates: ProviderCandidate[] = [];
  const rejections: CandidateRejection[] = [];
  const policy = input.policy.document.rules;
  const installedNames = new Set(
    input.project.dependencies.map((dependency) => dependency.name)
  );
  const motionEnvironmentResult = motionEnvironment(input.project);

  for (const providerId of PROVIDERS) {
    if (input.request.preferences.forbiddenProviders.includes(providerId)) {
      rejections.push({
        providerId,
        reasonCode: "FORBIDDEN_PROVIDER",
        reason: `${providerId} is forbidden by the route request.`
      });
      continue;
    }
    if (
      !policy.allowedConnectors.includes(providerId) ||
      policy.deniedConnectors.includes(providerId)
    ) {
      rejections.push({
        providerId,
        reasonCode: "POLICY_DENIED",
        reason: `${providerId} is denied by the active routing policy.`
      });
      continue;
    }

    const record = input.catalog.get(providerId);
    const health = input.catalog.health(providerId);
    if (!isApprovedRecord(record) || health.state !== "healthy") {
      rejections.push({
        providerId,
        reasonCode: "CONNECTOR_UNHEALTHY",
        reason: `${providerId} is not a healthy approved selectable connector.`
      });
      continue;
    }

    const runtime = runtimeIntegrations(providerId, record.manifest);
    if (runtime.length === 0) {
      rejections.push({
        providerId,
        reasonCode: "RUNTIME_ARTIFACT_UNAVAILABLE",
        reason: `${providerId} has no available Phase 4 runtime artifact.`
      });
      continue;
    }

    const policyFailure = policyAllowsRuntime(runtime, input);
    if (policyFailure !== null) {
      rejections.push({
        providerId,
        reasonCode: policyFailure,
        reason: `${providerId} runtime artifacts violate ${policyFailure}.`
      });
      continue;
    }

    const environment =
      providerId === "motion"
        ? motionEnvironmentResult
        : { supported: true as const };
    const claims = record.manifest.capabilityClaims
      .map((claim): CandidateClaim => ({
        capabilityId: claim.capability,
        support: claim.support,
        confidence: claim.confidence,
        environmentSupported: environment.supported,
        ...(environment.reason === undefined
          ? {}
          : { environmentReason: environment.reason })
      }))
      .sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));

    const packageNames = runtime
      .map((integration) => integration.packageName)
      .filter((value): value is string => value !== undefined);
    candidates.push({
      providerId,
      native: providerId === "web-platform",
      manifest: record.manifest,
      runtimeIntegrationIds: runtime.map((integration) => integration.id).sort(),
      installed: packageNames.some((packageName) => installedNames.has(packageName)),
      legacyAliasPresent:
        providerId === "motion" && installedNames.has("framer-motion"),
      claims
    });
  }

  return {
    candidates: candidates.sort((left, right) =>
      left.providerId.localeCompare(right.providerId)
    ),
    rejections: stableRejections(rejections),
    capabilityCatalog: input.catalog.getCapabilityCatalog(),
    catalogSnapshot: input.catalog.snapshot("1970-01-01T00:00:00.000Z")
  };
}
