import type { ProjectSnapshot, RouteRequest } from "@soren-sdk/contracts";

import type { ConnectorRecord } from "../catalog/types.js";
import { routeCapabilities as routeCapabilitiesGuarded } from "./route-capabilities-guarded.js";
import type { RouteInput } from "./types.js";

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

function compareVersions(left: Version, right: Version): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function parseVersion(value: string): ParsedVersion | null {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/.exec(
    value.trim()
  );
  if (match === null) return null;
  return {
    version: [
      Number.parseInt(match[1] ?? "0", 10),
      Number.parseInt(match[2] ?? "0", 10),
      Number.parseInt(match[3] ?? "0", 10)
    ],
    parts: match[3] !== undefined ? 3 : match[2] !== undefined ? 2 : 1
  };
}

function normalizeRange(value: string): string {
  let result = value.trim();
  if (result.startsWith("workspace:")) {
    result = result.slice("workspace:".length).trim();
  }
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
  return {
    lower: { version: parsed.version, inclusive: true },
    upper: {
      version:
        parsed.parts === 1 ? [major + 1, 0, 0] : [major, minor + 1, 0],
      inclusive: false
    }
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
  const clause = value.trim();
  if (clause === "" || clause === "*" || clause.toLowerCase() === "latest") {
    return { lower: null, upper: null };
  }

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
  return rangeIntervals(range).some((interval) =>
    intervalContains(interval, version)
  );
}

function requestedWorkspaces(request: RouteRequest): string[] {
  return [
    ...new Set(
      request.capabilities
        .filter((capability) => capability.required)
        .map((capability) => capability.quality?.workspace)
        .filter(
          (workspace): workspace is string =>
            typeof workspace === "string" && workspace.trim().length > 0
        )
        .map((workspace) => workspace.trim())
    )
  ].sort();
}

function schemaRecords(records: ConnectorRecord[]) {
  return records.filter(
    (record): record is Extract<ConnectorRecord, { kind: "schema-v2" }> =>
      record.kind === "schema-v2"
  );
}

function runtimePackageVersions(input: RouteInput): Map<string, Version[]> {
  const packages = new Map<string, Version[]>();
  for (const record of schemaRecords(input.catalog.list())) {
    for (const integration of record.manifest.integrations) {
      if (
        integration.kind !== "runtime-package" ||
        integration.mode !== "runtime" ||
        integration.status !== "available" ||
        integration.packageName === undefined ||
        integration.version.status !== "resolved" ||
        integration.version.value === undefined
      ) {
        continue;
      }
      const parsed = parseVersion(integration.version.value);
      if (parsed === null) continue;
      const versions = packages.get(integration.packageName) ?? [];
      versions.push(parsed.version);
      packages.set(integration.packageName, versions);
    }
  }
  return packages;
}

function hasCompatibleDependency(
  project: ProjectSnapshot,
  packageName: string,
  versions: readonly Version[],
  workspace: string
): boolean {
  return project.dependencies.some(
    (dependency) =>
      dependency.name === packageName &&
      (dependency.workspace ?? ".") === workspace &&
      versions.some((version) =>
        versionSatisfiesRange(version, dependency.version)
      )
  );
}

function reusableAcrossTargets(
  project: ProjectSnapshot,
  packageName: string,
  versions: readonly Version[],
  workspaces: readonly string[]
): boolean {
  const rootCompatible = hasCompatibleDependency(
    project,
    packageName,
    versions,
    "."
  );
  return workspaces.every((workspace) => {
    const localDependencies = project.dependencies.filter(
      (dependency) =>
        dependency.name === packageName &&
        (dependency.workspace ?? ".") === workspace
    );
    if (localDependencies.length === 0) return rootCompatible;
    return localDependencies.some((dependency) =>
      versions.some((version) =>
        versionSatisfiesRange(version, dependency.version)
      )
    );
  });
}

function guardMultiWorkspaceReuse(input: RouteInput): ProjectSnapshot {
  const workspaces = requestedWorkspaces(input.request);
  if (workspaces.length < 2) return input.project;

  const packages = runtimePackageVersions(input);
  const denied = new Set<string>();
  for (const [packageName, versions] of packages) {
    if (!reusableAcrossTargets(input.project, packageName, versions, workspaces)) {
      denied.add(packageName);
    }
  }
  if (denied.size === 0) return input.project;
  return {
    ...input.project,
    dependencies: input.project.dependencies.filter(
      (dependency) => !denied.has(dependency.name)
    )
  };
}

export function routeCapabilities(input: RouteInput) {
  return routeCapabilitiesGuarded({
    ...input,
    project: guardMultiWorkspaceReuse(input)
  });
}
