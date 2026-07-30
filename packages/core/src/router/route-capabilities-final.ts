import type { ProjectSnapshot } from "@soren-sdk/contracts";

import type {
  CatalogReader,
  ConnectorRecord,
  SchemaV2ConnectorRecord
} from "../catalog/types.js";
import { routeCapabilities as routeCapabilitiesReviewed } from "./route-capabilities-reviewed.js";
import type { RouteInput } from "./types.js";

function browserQuery(target: string): string {
  const trimmed = target.trim();
  const environmentPrefix = /^[A-Za-z0-9_-]+:(.*)$/.exec(trimmed);
  return (environmentPrefix?.[1] ?? trimmed).trim();
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

function filterAuthorizationRequiredRuntimes(
  record: SchemaV2ConnectorRecord
): SchemaV2ConnectorRecord {
  const integrations = record.manifest.integrations.map((integration) =>
    integration.mode === "runtime" && integration.authorization.required
      ? { ...integration, status: "unverified" as const }
      : integration
  );
  return {
    ...record,
    manifest: {
      ...record.manifest,
      integrations
    }
  };
}

function filteredRecord(record: ConnectorRecord): ConnectorRecord {
  return record.kind === "schema-v2"
    ? filterAuthorizationRequiredRuntimes(record)
    : record;
}

function routeCatalog(catalog: CatalogReader): CatalogReader {
  return {
    getCapabilityCatalog() {
      return catalog.getCapabilityCatalog();
    },
    list() {
      return catalog.list().map(filteredRecord);
    },
    get(connectorId) {
      const record = catalog.get(connectorId);
      return record === undefined ? undefined : filteredRecord(record);
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
  assertUniqueCapabilityIds(input);
  return routeCapabilitiesReviewed({
    ...input,
    project: normalizeBrowserTargets(input.project),
    catalog: routeCatalog(input.catalog)
  });
}
