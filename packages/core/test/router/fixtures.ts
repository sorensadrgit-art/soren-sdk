import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  digestJson,
  type CapabilityCatalog,
  type CatalogSnapshot,
  type ConnectorManifest,
  type JsonValue,
  type ProjectSnapshot,
  type RouteRequest
} from "@soren-sdk/contracts";

import type {
  CatalogReader,
  ConnectorHealthReport,
  ConnectorRecord
} from "../../src/catalog/types.js";

export function repositoryRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

function jsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

function manifest(providerId: string): ConnectorManifest {
  return JSON.parse(
    readFileSync(
      join(repositoryRoot(), "sdk-connectors", providerId, "sdk.manifest.json"),
      "utf8"
    )
  ) as ConnectorManifest;
}

export function routingCatalog(): CatalogReader {
  const capabilityCatalog = JSON.parse(
    readFileSync(join(repositoryRoot(), "capabilities", "catalog.json"), "utf8")
  ) as CapabilityCatalog;
  const records = new Map<string, ConnectorRecord>();
  for (const providerId of ["gsap", "motion", "web-platform"] as const) {
    const value = manifest(providerId);
    records.set(providerId, {
      kind: "schema-v2",
      directoryId: providerId,
      path: join(
        repositoryRoot(),
        "sdk-connectors",
        providerId,
        "sdk.manifest.json"
      ),
      manifest: value,
      selectable: value.connector.selectable
    });
  }

  function health(providerId: string): ConnectorHealthReport {
    const record = records.get(providerId);
    return record?.kind === "schema-v2"
      ? {
          connectorId: providerId,
          state: "healthy",
          selectable: true,
          reviewStatus: record.manifest.connector.reviewStatus,
          blockers: [],
          warnings: [],
          errors: []
        }
      : {
          connectorId: providerId,
          state: "missing",
          selectable: false,
          reviewStatus: null,
          blockers: [],
          warnings: [],
          errors: [`Connector ${providerId} is missing.`]
        };
  }

  function snapshot(createdAt = "1970-01-01T00:00:00.000Z"): CatalogSnapshot {
    const connectors = [...records.values()]
      .filter((record) => record.kind === "schema-v2")
      .map((record) => ({
        id: record.manifest.connector.id,
        connectorVersion: record.manifest.connectorVersion,
        digest: digestJson(jsonValue(record.manifest)),
        reviewStatus: record.manifest.connector.reviewStatus,
        selectable: record.manifest.connector.selectable
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
    const capabilityCatalogDigest = digestJson(jsonValue(capabilityCatalog));
    return {
      schemaVersion: "1.0.0-draft.1",
      contractKind: "catalog-snapshot",
      snapshotId: digestJson(
        jsonValue({ capabilityCatalogDigest, connectors })
      ),
      createdAt,
      capabilityCatalogDigest,
      connectors
    };
  }

  return {
    getCapabilityCatalog: () => capabilityCatalog,
    list: () => [...records.values()],
    get: (providerId) => records.get(providerId),
    health,
    snapshot
  };
}

export function projectFixture(options: {
  react?: string;
  dependencies?: string[];
  root?: string;
} = {}): ProjectSnapshot {
  const dependencyNames = new Set(options.dependencies ?? []);
  if (options.react !== undefined) dependencyNames.add("react");
  const dependencies = [...dependencyNames]
    .sort()
    .map((name) => ({
      name,
      version: name === "react" ? options.react ?? "19.2.0" : "1.0.0",
      kind: "dependency" as const,
      workspace: "."
    }));

  return {
    schemaVersion: "1.0.0-draft.1",
    contractKind: "project-snapshot",
    snapshotId: `sha256:${"1".repeat(64)}`,
    createdAt: "2026-07-30T00:00:00.000Z",
    root: options.root ?? "/tmp/project",
    revision: { vcs: "none", commit: null, dirty: false },
    packageManager: {
      name: "pnpm",
      version: "11.17.0",
      lockfile: "pnpm-lock.yaml",
      lockfileDigest: `sha256:${"2".repeat(64)}`
    },
    workspace: {
      isMonorepo: false,
      packages: [{ name: "fixture", path: ".", private: true }]
    },
    runtimes: [{ name: "node", version: ">=24" }],
    frameworks:
      options.react === undefined
        ? []
        : [{ name: "react", version: options.react, workspace: "." }],
    dependencies,
    configurations: [],
    policies: [],
    targets: { browsers: ["defaults"], runtimes: ["node@>=24"] },
    warnings: []
  };
}

export function requestFixture(options: {
  capability?: string;
  preferredProviders?: string[];
  forbiddenProviders?: string[];
  maxProviders?: number;
} = {}): RouteRequest {
  return {
    schemaVersion: "1.0.0-draft.1",
    contractKind: "route-request",
    requestId: "fixture_request",
    createdAt: "2026-07-30T00:00:00.000Z",
    projectSnapshotId: `sha256:${"1".repeat(64)}`,
    summary: "Fixture routing request",
    capabilities: [
      {
        id: options.capability ?? "motion.presence",
        required: true
      }
    ],
    preferences: {
      preferredProviders: options.preferredProviders ?? [],
      forbiddenProviders: options.forbiddenProviders ?? [],
      maxProviders: options.maxProviders ?? 2,
      allowPaidServices: false,
      allowExperimental: false
    }
  };
}
