import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ProjectSnapshot,
  RouteRequest
} from "@soren-sdk/contracts";
import { FileSystemConnectorCatalog } from "@soren-sdk/connectors";

export function repositoryRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

export function routingCatalog(): FileSystemConnectorCatalog {
  return new FileSystemConnectorCatalog({ root: repositoryRoot() });
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
