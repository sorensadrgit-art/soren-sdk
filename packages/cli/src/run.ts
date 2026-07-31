import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import {
  CatalogService,
  ProjectInspectionError,
  RouteInputError,
  inspectProject,
  routeCapabilities
} from "@soren-sdk/core";
import {
  ConnectorCatalogError,
  FileSystemConnectorCatalog,
  SqliteCatalogSnapshotStore
} from "@soren-sdk/connectors";

import {
  formatConnector,
  formatConnectorLine,
  formatHealth,
  formatJson,
  formatProjectSnapshot,
  formatRoutePlan
} from "./format.js";
import {
  buildRouteRequest,
  parseRouteOptions
} from "./route-options.js";

export interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

export interface RunCliOptions {
  argv: string[];
  cwd: string;
  io: CliIo;
}

class CliUsageError extends Error {
  override readonly name = "CliUsageError";
}

function parseJsonOption(args: string[]): { json: boolean } {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      json: { type: "boolean", default: false }
    }
  });
  return { json: parsed.values.json ?? false };
}

function parseInspectOptions(args: string[]): {
  json: boolean;
  path: string;
} {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      json: { type: "boolean", default: false }
    }
  });
  if (parsed.positionals.length > 1) {
    throw new CliUsageError("inspect accepts at most one project path.");
  }
  return {
    json: parsed.values.json ?? false,
    path: parsed.positionals[0] ?? "."
  };
}

function parseSnapshotOptions(args: string[]): {
  json: boolean;
  database?: string;
} {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      json: { type: "boolean", default: false },
      database: { type: "string" }
    }
  });
  const database = parsed.values.database;
  return database === undefined
    ? { json: parsed.values.json ?? false }
    : { json: parsed.values.json ?? false, database };
}

function usage(): string {
  return [
    "Usage:",
    "  soren-sdk inspect [path] [--json]",
    "  soren-sdk route --capability <id> [--capability <id>] [--optional <id>] [--project <path>] [--preferred <provider>] [--forbidden <provider>] [--max-providers <number>] [--scope <scope>] [--property <property>] [--json]",
    "  soren-sdk catalog list [--json]",
    "  soren-sdk catalog get <connector-id> [--json]",
    "  soren-sdk connector health <connector-id> [--json]",
    "  soren-sdk catalog snapshot [--database <path>] [--json]"
  ].join("\n");
}

export function runCli(options: RunCliOptions): number {
  try {
    const [domain, action, identifier, ...rest] = options.argv;

    if (domain === "inspect") {
      const parsed = parseInspectOptions(options.argv.slice(1));
      const snapshot = inspectProject({
        root: resolve(options.cwd, parsed.path),
        createdAt: new Date().toISOString()
      });
      options.io.stdout(
        parsed.json ? formatJson(snapshot) : formatProjectSnapshot(snapshot)
      );
      return 0;
    }

    if (domain === "route") {
      const parsed = parseRouteOptions(options.argv.slice(1));
      const createdAt = new Date().toISOString();
      const project = inspectProject({
        root: resolve(options.cwd, parsed.project),
        createdAt
      });
      const catalog = new FileSystemConnectorCatalog({ root: options.cwd });
      const request = buildRouteRequest(parsed, project.snapshotId, createdAt);
      const plan = routeCapabilities({
        request,
        project,
        catalog,
        createdAt
      });
      options.io.stdout(parsed.json ? formatJson(plan) : formatRoutePlan(plan));
      return 0;
    }

    const catalog = new FileSystemConnectorCatalog({ root: options.cwd });
    const service = new CatalogService(catalog);

    if (domain === "catalog" && action === "list") {
      const optionArgs = identifier === undefined ? rest : [identifier, ...rest];
      const parsed = parseJsonOption(optionArgs);
      const records = service.listConnectors();
      options.io.stdout(
        parsed.json
          ? formatJson(records)
          : `${records.map(formatConnectorLine).join("\n")}\n`
      );
      return 0;
    }

    if (domain === "catalog" && action === "get") {
      if (identifier === undefined || identifier.startsWith("--")) {
        throw new CliUsageError("catalog get requires a connector ID.");
      }
      const parsed = parseJsonOption(rest);
      const record = service.getConnector(identifier);
      if (record === undefined) {
        options.io.stderr(`Unknown connector: ${identifier}\n`);
        return 2;
      }
      options.io.stdout(parsed.json ? formatJson(record) : formatConnector(record));
      return 0;
    }

    if (domain === "connector" && action === "health") {
      if (identifier === undefined || identifier.startsWith("--")) {
        throw new CliUsageError("connector health requires a connector ID.");
      }
      const parsed = parseJsonOption(rest);
      const record = service.getConnector(identifier);
      if (record === undefined) {
        options.io.stderr(`Unknown connector: ${identifier}\n`);
        return 2;
      }
      const report = service.getConnectorHealth(identifier);
      options.io.stdout(parsed.json ? formatJson(report) : formatHealth(report));
      return 0;
    }

    if (domain === "catalog" && action === "snapshot") {
      const optionArgs = identifier === undefined ? rest : [identifier, ...rest];
      const parsed = parseSnapshotOptions(optionArgs);
      const snapshot = service.createSnapshot(new Date().toISOString());
      if (parsed.database !== undefined) {
        const databasePath = resolve(options.cwd, parsed.database);
        mkdirSync(dirname(databasePath), { recursive: true });
        const store = new SqliteCatalogSnapshotStore(databasePath);
        try {
          store.save(snapshot);
        } finally {
          store.close();
        }
      }
      options.io.stdout(formatJson(snapshot));
      return 0;
    }

    throw new CliUsageError("Unknown command.");
  } catch (error) {
    if (error instanceof CliUsageError || error instanceof TypeError) {
      options.io.stderr(
        `${error instanceof Error ? error.message : "Invalid arguments."}\n${usage()}\n`
      );
      return 2;
    }
    if (error instanceof ConnectorCatalogError) {
      options.io.stderr(`${error.code}: ${error.message}\n`);
      return 1;
    }
    if (error instanceof ProjectInspectionError) {
      options.io.stderr(`${error.code}: ${error.message}\n`);
      return 1;
    }
    if (error instanceof RouteInputError) {
      options.io.stderr(`${error.message}\n`);
      return 1;
    }
    options.io.stderr(
      `${error instanceof Error ? error.message : "Unknown Soren SDK failure."}\n`
    );
    return 1;
  }
}
