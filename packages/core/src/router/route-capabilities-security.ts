import {
  assertContract,
  type IntegrationArtifact,
  type ProjectSnapshot,
  type RouteRequest
} from "@soren-sdk/contracts";

import type { CatalogReader, ConnectorRecord } from "../catalog/types.js";
import { routeCapabilities as routeCapabilitiesWorkspaceReuse } from "./route-capabilities-workspace-reuse.js";
import type { RouteInput } from "./types.js";

const PRERELEASE_PACKAGE_SENTINEL =
  "soren-sdk-prerelease-runtime-unmatched";
const STRICT_SEMVER =
  /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function isPrereleaseVersion(value: string): boolean {
  return STRICT_SEMVER.exec(value.trim())?.[4] !== undefined;
}

function guardIntegration(
  integration: IntegrationArtifact
): IntegrationArtifact {
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

function guardRecord(record: ConnectorRecord): ConnectorRecord {
  if (record.kind !== "schema-v2") return record;
  const integrations = record.manifest.integrations.map(guardIntegration);
  const changed = integrations.some(
    (integration, index) => integration !== record.manifest.integrations[index]
  );
  if (!changed) return record;
  return {
    ...record,
    manifest: {
      ...record.manifest,
      integrations
    }
  };
}

class SecurityCatalogView implements CatalogReader {
  constructor(private readonly base: CatalogReader) {}

  getCapabilityCatalog() {
    return this.base.getCapabilityCatalog();
  }

  list(): ConnectorRecord[] {
    return this.base.list().map(guardRecord);
  }

  get(connectorId: string): ConnectorRecord | undefined {
    const record = this.base.get(connectorId);
    return record === undefined ? undefined : guardRecord(record);
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
  return routeCapabilitiesWorkspaceReuse({
    ...input,
    project: effectiveBrowserTargets(input.project),
    catalog: new SecurityCatalogView(input.catalog)
  });
}
