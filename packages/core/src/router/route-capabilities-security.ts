import {
  ContractValidationError,
  assertContract,
  type CapabilityCatalog,
  type IntegrationArtifact,
  type ProjectSnapshot,
  type RouteRequest
} from "@soren-sdk/contracts";

import type {
  CatalogReader,
  ConnectorHealthReport,
  ConnectorRecord
} from "../catalog/types.js";
import { projectSnapshotDigest } from "../inspector/project-snapshot-digest.js";
import { routeCapabilities as routeCapabilitiesWorkspaceReuse } from "./route-capabilities-workspace-reuse.js";
import type { RouteInput } from "./types.js";

const PRERELEASE_PACKAGE_SENTINEL =
  "soren-sdk-prerelease-runtime-unmatched";
const STRICT_SEMVER =
  /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const PARTIAL_COMPARATOR =
  /(^|[\s,|:@])(>=|<=|>|<)\s*v?(\d+)(?:\.(\d+))?(?=$|[\s,|])/g;
const PARTIAL_HYPHEN_RANGE =
  /(^|[\s,|])v?(\d+)(?:\.(\d+))?(?:\.(\d+))?\s+-\s+v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?=$|[\s,|])/g;

function isPrereleaseVersion(value: string): boolean {
  return STRICT_SEMVER.exec(value.trim())?.[4] !== undefined;
}

function recordId(record: ConnectorRecord): string {
  return record.kind === "schema-v2"
    ? record.manifest.connector.id
    : record.directoryId;
}

function freezeCatalog(catalog: CatalogReader): CatalogReader {
  const capabilities = structuredClone(catalog.getCapabilityCatalog());
  const records = catalog.list().map((record) => structuredClone(record));
  const health = new Map<string, ConnectorHealthReport>();
  const recordsById = new Map<string, ConnectorRecord>();
  for (const record of records) {
    const id = recordId(record);
    recordsById.set(record.directoryId, record);
    recordsById.set(id, record);
    if (!health.has(id)) health.set(id, structuredClone(catalog.health(id)));
  }
  const snapshot = structuredClone(catalog.snapshot());
  return {
    getCapabilityCatalog: () => capabilities,
    list: () => [...records],
    get: (connectorId) => recordsById.get(connectorId),
    health: (connectorId) =>
      health.get(connectorId) ?? {
        connectorId,
        state: "missing",
        selectable: false,
        reviewStatus: null,
        blockers: [],
        warnings: [],
        errors: ["missing"]
      },
    snapshot: (createdAt = snapshot.createdAt) => ({
      ...snapshot,
      createdAt,
      connectors: snapshot.connectors.map((connector) => ({ ...connector }))
    })
  };
}

function assertProjectSnapshotDigest(project: ProjectSnapshot): void {
  const expected = projectSnapshotDigest(project);
  if (project.snapshotId === expected) return;
  throw new ContractValidationError(
    "Project Snapshot content does not match its snapshotId.",
    [
      {
        instancePath: "/snapshotId",
        schemaPath: "#/project-snapshot/snapshotId",
        keyword: "project-snapshot-digest",
        message: "Project Snapshot content digest does not match snapshotId.",
        params: {
          actual: project.snapshotId,
          expected
        }
      }
    ]
  );
}

function expandPartialComparators(value: string): string {
  return value.replace(
    PARTIAL_COMPARATOR,
    (_match, prefix: string, operator: string, majorText: string, minorText?: string) => {
      const major = Number.parseInt(majorText, 10);
      const minor = minorText === undefined ? null : Number.parseInt(minorText, 10);
      if (operator === ">") {
        return minor === null
          ? `${prefix}>=${major + 1}.0.0`
          : `${prefix}>=${major}.${minor + 1}.0`;
      }
      if (operator === "<=") {
        return minor === null
          ? `${prefix}<${major + 1}.0.0`
          : `${prefix}<${major}.${minor + 1}.0`;
      }
      const patchLevel = `${major}.${minor ?? 0}.0`;
      return `${prefix}${operator}${patchLevel}`;
    }
  );
}

function expandPartialHyphenRanges(value: string): string {
  return value.replace(
    PARTIAL_HYPHEN_RANGE,
    (
      _match,
      prefix: string,
      lowerMajorText: string,
      lowerMinorText: string | undefined,
      lowerPatchText: string | undefined,
      upperMajorText: string,
      upperMinorText: string | undefined,
      upperPatchText: string | undefined
    ) => {
      const lowerMajor = Number.parseInt(lowerMajorText, 10);
      const lowerMinor = Number.parseInt(lowerMinorText ?? "0", 10);
      const lowerPatch = Number.parseInt(lowerPatchText ?? "0", 10);
      const upperMajor = Number.parseInt(upperMajorText, 10);
      const upperMinor = Number.parseInt(upperMinorText ?? "0", 10);
      const lower = `>=${lowerMajor}.${lowerMinor}.${lowerPatch}`;
      if (upperPatchText !== undefined) {
        return `${prefix}${lower} <=${upperMajor}.${upperMinor}.${Number.parseInt(
          upperPatchText,
          10
        )}`;
      }
      const upper =
        upperMinorText === undefined
          ? `<${upperMajor + 1}.0.0`
          : `<${upperMajor}.${upperMinor + 1}.0`;
      return `${prefix}${lower} ${upper}`;
    }
  );
}

function normalizeDependencyRange(value: string): string {
  return expandPartialComparators(expandPartialHyphenRanges(value));
}

function runtimePackageShadowTargets(
  request: RouteRequest,
  catalog: CatalogReader
): Map<string, string> {
  const targets = new Map<string, Set<string>>();
  const unscoped = new Set<string>();

  for (const record of catalog.list()) {
    if (record.kind !== "schema-v2") continue;
    const claims = new Set(
      record.manifest.capabilityClaims.map((claim) => claim.capability)
    );
    const relevant = request.capabilities.filter(
      (capability) => capability.required && claims.has(capability.id)
    );
    if (relevant.length === 0) continue;

    const explicit = new Set<string>();
    let hasUnscoped = false;
    for (const capability of relevant) {
      const workspace = capability.quality?.workspace;
      if (typeof workspace !== "string" || workspace.trim() === "") {
        hasUnscoped = true;
      } else {
        explicit.add(workspace.trim());
      }
    }

    for (const integration of record.manifest.integrations) {
      if (
        integration.kind !== "runtime-package" ||
        integration.mode !== "runtime" ||
        integration.packageName === undefined
      ) {
        continue;
      }
      if (hasUnscoped) {
        unscoped.add(integration.packageName);
        continue;
      }
      const packageTargets =
        targets.get(integration.packageName) ?? new Set<string>();
      for (const workspace of explicit) packageTargets.add(workspace);
      targets.set(integration.packageName, packageTargets);
    }
  }

  const result = new Map<string, string>();
  for (const [packageName, workspaces] of targets) {
    if (unscoped.has(packageName) || workspaces.size !== 1) continue;
    const workspace = [...workspaces][0];
    if (workspace !== undefined && workspace !== ".") {
      result.set(packageName, workspace);
    }
  }
  return result;
}

function guardDependencies(
  project: ProjectSnapshot,
  request: RouteRequest,
  catalog: CatalogReader
): ProjectSnapshot {
  let dependencies = project.dependencies.map((dependency) => ({
    ...dependency,
    version: normalizeDependencyRange(dependency.version)
  }));
  const shadowTargets = runtimePackageShadowTargets(request, catalog);
  const shadowedRootPackages = new Set(
    [...shadowTargets].flatMap(([packageName, workspace]) =>
      dependencies.some(
        (dependency) =>
          dependency.name === packageName &&
          (dependency.workspace ?? ".") === workspace
      )
        ? [packageName]
        : []
    )
  );
  dependencies = dependencies.filter(
    (dependency) =>
      (dependency.workspace ?? ".") !== "." ||
      !shadowedRootPackages.has(dependency.name)
  );
  const frameworks = project.frameworks.map((framework) => ({
    ...framework,
    version:
      framework.version === null
        ? null
        : expandPartialComparators(framework.version)
  }));
  return { ...project, dependencies, frameworks };
}

interface PropertyRequirement {
  domain: string;
  property: string;
}

function propertyRequirements(
  request: RouteRequest,
  catalog: CapabilityCatalog
): Map<string, PropertyRequirement> {
  const domains = new Map(
    catalog.capabilities.map((capability) => [
      capability.id,
      capability.ownershipDomain
    ])
  );
  const requirements = new Map<string, PropertyRequirement>();
  for (const capability of request.capabilities) {
    const property = capability.quality?.property;
    const domain = domains.get(capability.id);
    if (typeof property !== "string" || property.trim() === "" || domain === undefined) {
      continue;
    }
    requirements.set(capability.id, {
      domain,
      property: property.trim()
    });
  }
  return requirements;
}

function guardIntegration(
  integration: IntegrationArtifact,
  providerId: string
): IntegrationArtifact {
  if (
    integration.kind === "built-in" &&
    providerId !== "web-platform" &&
    integration.status === "available"
  ) {
    return { ...integration, status: "unverified" };
  }
  if (integration.kind !== "runtime-package") return integration;
  let guarded = integration;
  if (
    guarded.status === "available" &&
    guarded.licenseExpression === "not-applicable"
  ) {
    guarded = { ...guarded, status: "unverified" };
  }
  if (
    guarded.packageName !== undefined &&
    guarded.version.status === "resolved" &&
    guarded.version.value !== undefined &&
    isPrereleaseVersion(guarded.version.value)
  ) {
    guarded = {
      ...guarded,
      packageName: PRERELEASE_PACKAGE_SENTINEL
    };
  }
  return guarded;
}

function supportsRequestedProperty(
  record: Extract<ConnectorRecord, { kind: "schema-v2" }>,
  requirement: PropertyRequirement
): boolean {
  return record.manifest.ownershipClaims.some(
    (claim) =>
      claim.domain === requirement.domain &&
      (claim.properties === undefined ||
        claim.properties.length === 0 ||
        claim.properties.includes(requirement.property))
  );
}

function guardRecord(
  record: ConnectorRecord,
  requirements: ReadonlyMap<string, PropertyRequirement>
): ConnectorRecord {
  if (record.kind !== "schema-v2") return record;
  const integrations = record.manifest.integrations.map((integration) =>
    guardIntegration(integration, record.manifest.connector.id)
  );
  const capabilityClaims = record.manifest.capabilityClaims.filter((claim) => {
    const requirement = requirements.get(claim.capability);
    return requirement === undefined || supportsRequestedProperty(record, requirement);
  });
  const changed =
    integrations.some(
      (integration, index) => integration !== record.manifest.integrations[index]
    ) || capabilityClaims.length !== record.manifest.capabilityClaims.length;
  if (!changed) return record;
  return {
    ...record,
    manifest: {
      ...record.manifest,
      capabilityClaims,
      integrations
    }
  };
}

class SecurityCatalogView implements CatalogReader {
  private readonly requirements: ReadonlyMap<string, PropertyRequirement>;

  constructor(
    private readonly base: CatalogReader,
    request: RouteRequest
  ) {
    this.requirements = propertyRequirements(request, base.getCapabilityCatalog());
  }

  getCapabilityCatalog() {
    return this.base.getCapabilityCatalog();
  }

  list(): ConnectorRecord[] {
    return this.base.list().map((record) => guardRecord(record, this.requirements));
  }

  get(connectorId: string): ConnectorRecord | undefined {
    const record = this.base.get(connectorId);
    return record === undefined
      ? undefined
      : guardRecord(record, this.requirements);
  }

  health(connectorId: string) {
    return this.base.health(connectorId);
  }

  snapshot(createdAt?: string) {
    return createdAt === undefined
      ? this.base.snapshot()
      : this.base.snapshot(createdAt);
  }
}

interface BrowserClause {
  environment: string | null;
  value: string;
}

function parseBrowserClause(value: string): BrowserClause | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const separator = trimmed.indexOf(":");
  if (
    separator > 0 &&
    !trimmed.startsWith("[") &&
    !trimmed.slice(0, separator).includes(" ")
  ) {
    return {
      environment: trimmed.slice(0, separator),
      value: trimmed.slice(separator + 1).trim()
    };
  }
  return { environment: null, value: trimmed };
}

function normalizedBrowserClause(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function effectiveBrowserTargets(
  project: ProjectSnapshot
): ProjectSnapshot {
  const clauses = project.targets.browsers.flatMap((target) =>
    target
      .split(",")
      .map(parseBrowserClause)
      .filter((clause): clause is BrowserClause => clause !== null)
  );
  const exclusions = new Set<string>();
  for (const clause of clauses) {
    if (!/^not\s+/i.test(clause.value)) continue;
    const excluded = normalizedBrowserClause(
      clause.value.replace(/^not\s+/i, "")
    );
    exclusions.add(`${clause.environment ?? "*"}|${excluded}`);
  }

  const browsers = clauses
    .filter((clause) => !/^not\s+/i.test(clause.value))
    .filter((clause) => {
      const value = normalizedBrowserClause(clause.value);
      return (
        !exclusions.has(`*|${value}`) &&
        !exclusions.has(`${clause.environment ?? "*"}|${value}`)
      );
    })
    .map((clause) =>
      clause.environment === null
        ? clause.value
        : `${clause.environment}:${clause.value}`
    );

  return {
    ...project,
    targets: {
      ...project.targets,
      browsers
    }
  };
}

export function routeCapabilities(input: RouteInput) {
  assertContract<RouteRequest>("route-request", input.request);
  assertContract<ProjectSnapshot>("project-snapshot", input.project);
  assertProjectSnapshotDigest(input.project);
  const catalog = freezeCatalog(input.catalog);
  const project = guardDependencies(
    effectiveBrowserTargets(input.project),
    input.request,
    catalog
  );
  return routeCapabilitiesWorkspaceReuse({
    ...input,
    project,
    catalog: new SecurityCatalogView(catalog, input.request)
  });
}
