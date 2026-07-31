import type {
  IntegrationArtifact,
  PolicyDocument,
  ProjectSnapshot,
  RouteRequest
} from "@soren-sdk/contracts";

import type { CatalogReader, ConnectorRecord } from "../catalog/types.js";
import { getRequiredCompanionIntegrationIds } from "./policy.js";
import type {
  ProviderCandidate,
  ProviderRejection,
  RouteReasonCode
} from "./types.js";

const PHASE_PROVIDER_IDS = new Set(["gsap", "motion", "web-platform"]);
const RUNTIME_KINDS = new Set(["built-in", "runtime-package"]);
const APPROVED_REVIEW_STATUSES = new Set(["approved", "stable"]);
const DENIED_EXECUTION_RISKS = new Set([
  "command-execution",
  "network-and-command",
  "privileged",
  "project-write"
]);

type Version = [number, number, number];

interface VersionBound {
  version: Version;
  inclusive: boolean;
}

interface VersionInterval {
  lower: VersionBound | null;
  upper: VersionBound | null;
}

interface ParsedVersion {
  version: Version;
  parts: number;
}

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

function compareVersions(left: Version, right: Version): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function parseVersion(value: string): ParsedVersion | null {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/.exec(
    value.trim()
  );
  if (match === null) return null;
  const parts = match[3] !== undefined ? 3 : match[2] !== undefined ? 2 : 1;
  return {
    version: [
      Number.parseInt(match[1] ?? "0", 10),
      Number.parseInt(match[2] ?? "0", 10),
      Number.parseInt(match[3] ?? "0", 10)
    ],
    parts
  };
}

function stripWorkspaceProtocol(value: string): string {
  const result = value.trim();
  return result.startsWith("workspace:")
    ? result.slice("workspace:".length).trim()
    : result;
}

function npmAliasTarget(value: string): string | null {
  const result = stripWorkspaceProtocol(value);
  if (!result.startsWith("npm:")) return null;
  const aliasSpec = result.slice("npm:".length);
  const separator = aliasSpec.lastIndexOf("@");
  return separator > 0 ? aliasSpec.slice(0, separator) : aliasSpec;
}

function dependencyTargetsPackage(value: string, packageName: string): boolean {
  const aliasTarget = npmAliasTarget(value);
  return aliasTarget === null || aliasTarget === packageName;
}

function normalizeRange(value: string): string {
  let result = stripWorkspaceProtocol(value);
  if (result.startsWith("npm:")) {
    const separator = result.lastIndexOf("@");
    result = separator > "npm:".length ? result.slice(separator + 1) : result;
  }
  return result;
}

function strongerLower(
  current: VersionBound | null,
  candidate: VersionBound
): VersionBound {
  if (current === null) return candidate;
  const comparison = compareVersions(candidate.version, current.version);
  if (comparison > 0) return candidate;
  if (comparison < 0) return current;
  return {
    version: current.version,
    inclusive: current.inclusive && candidate.inclusive
  };
}

function strongerUpper(
  current: VersionBound | null,
  candidate: VersionBound
): VersionBound {
  if (current === null) return candidate;
  const comparison = compareVersions(candidate.version, current.version);
  if (comparison < 0) return candidate;
  if (comparison > 0) return current;
  return {
    version: current.version,
    inclusive: current.inclusive && candidate.inclusive
  };
}

function intersectIntervals(
  base: VersionInterval,
  additional: VersionInterval
): VersionInterval {
  return {
    lower:
      additional.lower === null
        ? base.lower
        : strongerLower(base.lower, additional.lower),
    upper:
      additional.upper === null
        ? base.upper
        : strongerUpper(base.upper, additional.upper)
  };
}

function intervalIsValid(interval: VersionInterval): boolean {
  if (interval.lower === null || interval.upper === null) return true;
  const comparison = compareVersions(
    interval.lower.version,
    interval.upper.version
  );
  return (
    comparison < 0 ||
    (comparison === 0 && interval.lower.inclusive && interval.upper.inclusive)
  );
}

function partialInterval(parsed: ParsedVersion): VersionInterval {
  const [major, minor] = parsed.version;
  if (parsed.parts === 1) {
    return {
      lower: { version: parsed.version, inclusive: true },
      upper: { version: [major + 1, 0, 0], inclusive: false }
    };
  }
  return {
    lower: { version: parsed.version, inclusive: true },
    upper: { version: [major, minor + 1, 0], inclusive: false }
  };
}

function caretInterval(parsed: ParsedVersion): VersionInterval {
  const [major, minor, patch] = parsed.version;
  const upper: Version =
    major > 0
      ? [major + 1, 0, 0]
      : minor > 0
        ? [0, minor + 1, 0]
        : [0, 0, patch + 1];
  return {
    lower: { version: parsed.version, inclusive: true },
    upper: { version: upper, inclusive: false }
  };
}

function tildeInterval(parsed: ParsedVersion): VersionInterval {
  const [major, minor] = parsed.version;
  const upper: Version =
    parsed.parts === 1 ? [major + 1, 0, 0] : [major, minor + 1, 0];
  return {
    lower: { version: parsed.version, inclusive: true },
    upper: { version: upper, inclusive: false }
  };
}

function parseComparator(token: string): VersionInterval | null {
  const match = /^(>=|<=|>|<|=)?\s*(v?\d+(?:\.\d+){0,2})$/.exec(token);
  if (match === null) return null;
  const parsed = parseVersion(match[2] ?? "");
  if (parsed === null) return null;
  const operator = match[1];
  if (operator === undefined && parsed.parts < 3) return partialInterval(parsed);
  if (operator === undefined || operator === "=") {
    return {
      lower: { version: parsed.version, inclusive: true },
      upper: { version: parsed.version, inclusive: true }
    };
  }
  if (operator === ">" || operator === ">=") {
    return {
      lower: {
        version: parsed.version,
        inclusive: operator === ">="
      },
      upper: null
    };
  }
  return {
    lower: null,
    upper: {
      version: parsed.version,
      inclusive: operator === "<="
    }
  };
}

function parseRangeClause(value: string): VersionInterval | null {
  const clause = value
    .trim()
    .replace(/(>=|<=|>|<|=)\s+(?=v?\d)/g, "$1");
  if (clause === "" || clause === "*") {
    return { lower: null, upper: null };
  }
  if (clause.toLowerCase() === "latest") return null;

  const hyphen = /^(v?\d+(?:\.\d+){0,2})\s+-\s+(v?\d+(?:\.\d+){0,2})$/.exec(
    clause
  );
  if (hyphen !== null) {
    const lower = parseVersion(hyphen[1] ?? "");
    const upper = parseVersion(hyphen[2] ?? "");
    if (lower === null || upper === null) return null;
    const interval: VersionInterval = {
      lower: { version: lower.version, inclusive: true },
      upper: { version: upper.version, inclusive: true }
    };
    return intervalIsValid(interval) ? interval : null;
  }

  if (clause.startsWith("^")) {
    const parsed = parseVersion(clause.slice(1));
    return parsed === null ? null : caretInterval(parsed);
  }
  if (clause.startsWith("~")) {
    const parsed = parseVersion(clause.slice(1));
    return parsed === null ? null : tildeInterval(parsed);
  }

  const wildcard = /^(\d+)(?:\.(\d+))?(?:\.(?:x|X|\*))?$/.exec(clause);
  if (wildcard !== null && /(?:x|X|\*)/.test(clause)) {
    const parsed = parseVersion(
      wildcard[2] === undefined
        ? wildcard[1] ?? ""
        : `${wildcard[1]}.${wildcard[2]}`
    );
    return parsed === null ? null : partialInterval(parsed);
  }

  const tokens = clause.replaceAll(",", " ").split(/\s+/).filter(Boolean);
  let interval: VersionInterval = { lower: null, upper: null };
  for (const token of tokens) {
    const parsed = parseComparator(token);
    if (parsed === null) return null;
    interval = intersectIntervals(interval, parsed);
  }
  return intervalIsValid(interval) ? interval : null;
}

function rangeIntervals(value: string): VersionInterval[] {
  return normalizeRange(value)
    .split("||")
    .map((clause) => parseRangeClause(clause))
    .filter((interval): interval is VersionInterval => interval !== null);
}

function intervalContains(
  interval: VersionInterval,
  version: Version
): boolean {
  if (interval.lower !== null) {
    const lower = compareVersions(version, interval.lower.version);
    if (lower < 0 || (lower === 0 && !interval.lower.inclusive)) return false;
  }
  if (interval.upper !== null) {
    const upper = compareVersions(version, interval.upper.version);
    if (upper > 0 || (upper === 0 && !interval.upper.inclusive)) return false;
  }
  return true;
}

function versionSatisfiesRange(version: Version, range: string): boolean {
  const normalized = normalizeRange(range);
  if (/(?:^|[\s|,])(?:[~^<>=]*v?)?\d+\.\d+\.\d+-[0-9A-Za-z]/.test(normalized)) {
    return false;
  }
  return rangeIntervals(normalized).some((interval) =>
    intervalContains(interval, version)
  );
}

function rangeCanReachMinimum(range: string, minimum: Version): boolean {
  return rangeIntervals(range).some((interval) => {
    if (!intervalIsValid(interval)) return false;
    if (interval.upper === null) return true;
    const comparison = compareVersions(interval.upper.version, minimum);
    return comparison > 0 || (comparison === 0 && interval.upper.inclusive);
  });
}

function reactRange(project: ProjectSnapshot): string | null {
  const dependency = project.dependencies.find(
    (item) => item.name === "react"
  )?.version;
  const framework = project.frameworks.find(
    (item) => item.name === "react"
  )?.version;
  return dependency ?? framework ?? null;
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
  if (
    integration.dataExposure === "remote-project-content" &&
    !policy.rules.allowRemoteProjectContent
  ) {
    return false;
  }
  return true;
}

function hasDependencyReuse(
  project: ProjectSnapshot,
  runtimeIntegrations: readonly IntegrationArtifact[]
): boolean {
  return runtimeIntegrations.some((integration) => {
    if (
      integration.kind !== "runtime-package" ||
      integration.packageName === undefined ||
      integration.version.status !== "resolved" ||
      integration.version.value === undefined
    ) {
      return false;
    }
    const resolvedVersion = parseVersion(integration.version.value);
    if (resolvedVersion === null) return false;
    return project.dependencies.some(
      (dependency) =>
        dependency.name === integration.packageName &&
        dependencyTargetsPackage(
          dependency.version,
          integration.packageName ?? ""
        ) &&
        versionSatisfiesRange(resolvedVersion.version, dependency.version)
    );
  });
}

function supportsWaapiTargets(project: ProjectSnapshot): boolean {
  return !project.targets.browsers.some((target) => {
    const normalized = target.toLowerCase();
    return (
      /(^|[\s,])(ie|ie_mob)(?=\s|$)/.test(normalized) ||
      normalized.includes("internet explorer") ||
      normalized.includes("op_mini")
    );
  });
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
    !record.manifest.connector.selectable ||
    !APPROVED_REVIEW_STATUSES.has(record.manifest.connector.reviewStatus) ||
    record.manifest.connector.blockers.length > 0
  ) {
    return reject(
      id,
      "CONNECTOR_UNHEALTHY",
      `Provider "${id}" is not an approved, healthy, selectable Connector Manifest v2 record.`
    );
  }

  if (
    policy.rules.requireReducedMotion &&
    !record.manifest.verification.requiredChecks.includes("reduced-motion")
  ) {
    return reject(
      id,
      "POLICY_DENIED",
      `Provider "${id}" does not declare the required reduced-motion verification.`
    );
  }

  if (
    id === "web-platform" &&
    input.requiredCapabilityIds.has("platform.waapi-animation") &&
    !supportsWaapiTargets(input.project)
  ) {
    return reject(
      id,
      "ENVIRONMENT_UNSUPPORTED",
      "Web Animations API is unavailable for one or more inspected browser targets."
    );
  }

  if (id === "motion") {
    const hasRequiredMotionClaim = record.manifest.capabilityClaims.some((claim) =>
      input.requiredCapabilityIds.has(claim.capability)
    );
    if (hasRequiredMotionClaim) {
      const range = reactRange(input.project);
      if (range === null || !rangeCanReachMinimum(range, [18, 2, 0])) {
        return reject(
          id,
          "ENVIRONMENT_UNSUPPORTED",
          "Motion React capabilities require a React range that includes 18.2 or newer."
        );
      }
    }
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

    const runtimeIntegrations = record.manifest.integrations.filter((integration) =>
      integrationAllowed(integration, input.request, input.policy)
    );
    if (runtimeIntegrations.length === 0) {
      rejections.push(
        reject(
          id,
          "POLICY_DENIED",
          `Provider "${id}" has no policy-approved available runtime integration.`
        )
      );
      continue;
    }

    const availableIntegrationIds = new Set(
      runtimeIntegrations.map((integration) => integration.id)
    );
    const relevantClaims = record.manifest.capabilityClaims.filter((claim) =>
      input.requiredCapabilityIds.has(claim.capability)
    );
    const eligibleClaims = record.manifest.capabilityClaims.filter((claim) =>
      getRequiredCompanionIntegrationIds(id, claim.capability).every(
        (integrationId) => availableIntegrationIds.has(integrationId)
      )
    );
    const eligibleRelevantClaims = eligibleClaims.filter((claim) =>
      input.requiredCapabilityIds.has(claim.capability)
    );

    if (eligibleRelevantClaims.length === 0) {
      const missingCompanions = relevantClaims.flatMap((claim) =>
        getRequiredCompanionIntegrationIds(id, claim.capability).filter(
          (integrationId) => !availableIntegrationIds.has(integrationId)
        )
      );
      rejections.push(
        reject(
          id,
          "CAPABILITY_NOT_SUPPORTED",
          missingCompanions.length > 0
            ? `Provider "${id}" is missing required companion runtime artifacts: ${[
                ...new Set(missingCompanions)
              ]
                .sort()
                .join(", ")}.`
            : `Provider "${id}" does not claim a required capability.`
        )
      );
      continue;
    }

    const claims = new Map(
      eligibleClaims.map((claim) => [claim.capability, claim])
    );
    const integrationIds = runtimeIntegrations
      .map((integration) => integration.id)
      .sort();
    const rank = input.request.preferences.preferredProviders.indexOf(id);
    candidates.push({
      providerId: id,
      manifest: record.manifest,
      integrationIds,
      claims,
      dependencyReuse: hasDependencyReuse(input.project, runtimeIntegrations),
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
