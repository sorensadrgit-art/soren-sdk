import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { digestJson } from "@soren-sdk/contracts";
import type { Digest, RoutePlan } from "@soren-sdk/contracts";
import {
  ConfigLoadError,
  ConfigParseError,
  ConfigurationReader,
  LockfileError,
  LockfileService,
  NodeFileSystem,
  PolicyResolutionError,
  PolicyResolver
} from "@soren-sdk/config";
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
import { DeterministicExecutionPlanner, type CreateExecutionPlanInput } from "@soren-sdk/planner";
import { DeterministicEvidenceService, type EvidenceEnvelope } from "@soren-sdk/evidence";

import {
  formatConnector,
  formatConnectorLine,
  formatDrift,
  formatHealth,
  formatJson,
  formatLoadedConfig,
  formatLock,
  formatProjectSnapshot,
  formatResolvedPolicy
} from "./format.js";
import { parseConfigShowOptions } from "./config-options.js";
import { parsePolicyResolveOptions } from "./policy-options.js";
import {
  parseLockCheckOptions,
  parseLockCreateOptions,
  parseLockInspectOptions
} from "./lock-options.js";

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

function readJson(path: string): unknown { return JSON.parse(readFileSync(path, "utf8")); }
function atomicWrite(path: string, value: unknown): void { mkdirSync(dirname(path), { recursive: true }); const temporary = `${path}.tmp`; writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); renameSync(temporary, path); }

function usage(): string {
  return [
    "Usage:",
    "  soren-sdk inspect [path] [--json]",
    "  soren-sdk route --capability <id> [--capability <id>] [--optional <id>] [--project <path>] [--preferred <provider>] [--forbidden <provider>] [--max-providers <number>] [--scope <scope>] [--property <property>] [--json]",
    "  soren-sdk catalog list [--json]",
    "  soren-sdk catalog get <connector-id> [--json]",
    "  soren-sdk connector health <connector-id> [--json]",
    "  soren-sdk catalog snapshot [--database <path>] [--json]",
    "  soren-sdk config show [--project <path>] [--json]",
    "  soren-sdk policy resolve [--project <path>] [--json]",
    "  soren-sdk lock inspect [path] [--json]",
    "  soren-sdk lock check [path] [--project <path>] [--route-plan <path>] [--json]",
    "  soren-sdk lock create --project <path> --output <path> --route-plan <path> [--force] [--json]"
  ].join("\n");
}

interface ComputedCurrentInputs {
  projectSnapshotId: Digest;
  catalogSnapshotId: Digest;
  policySnapshotId: Digest;
  configDigest: Digest;
  routePlanId: string;
  routePlanDigest: Digest;
}

function loadRoutePlan(fs: NodeFileSystem, path: string): RoutePlan {
  const text = fs.readFile(path);
  if (text === undefined) {
    throw new ConfigLoadError(
      "CONFIG_NOT_FOUND",
      `route plan not found: ${path}`,
      path
    );
  }
  return JSON.parse(text) as RoutePlan;
}

function computeCurrentInputs(options: {
  cwd: string;
  project: string;
  routePlanPath?: string;
}): ComputedCurrentInputs {
  const fs = new NodeFileSystem();
  const projectRoot = resolve(options.cwd, options.project);

  const projectSnapshot = inspectProject({
    root: projectRoot,
    createdAt: new Date().toISOString()
  });

  const catalog = new FileSystemConnectorCatalog({ root: options.cwd });
  const catalogSnapshot = catalog.snapshot(new Date().toISOString());

  const policy = new PolicyResolver().resolve({ projectRoot, fs });

  const config = new ConfigurationReader({ fs }).loadProjectConfig(projectRoot);

  let routePlanId = "";
  let routePlanDigest = digestJson("");
  if (options.routePlanPath !== undefined) {
    const routePlan = loadRoutePlan(fs, resolve(options.cwd, options.routePlanPath));
    routePlanId = routePlan.planId;
    routePlanDigest = routePlan.digest;
  }

  return {
    projectSnapshotId: projectSnapshot.snapshotId,
    catalogSnapshotId: catalogSnapshot.snapshotId,
    policySnapshotId: policy.snapshotId,
    configDigest: config.digest,
    routePlanId,
    routePlanDigest
  };
}

function assertNoSymlinkPath(fs: NodeFileSystem, outputPath: string): void {
  let current = outputPath;
  while (true) {
    if (fs.isSymbolicLink(current)) {
      throw new Error(`refusing to write through symbolic link: ${current}`);
    }
    const parent = dirname(current);
    if (parent === current) {
      return;
    }
    current = parent;
  }
}

function assertNoParentTraversal(rawOutput: string): void {
  if (rawOutput.split(/[\\/]/).includes("..")) {
    throw new Error(
      `refusing to write through a parent-directory ("..") traversal: ${rawOutput}`
    );
  }
}

export function runCli(options: RunCliOptions): number {
  try {
    const [domain, action, identifier, ...rest] = options.argv;

    if (domain === "plan" && action === "create") {
      const requestIndex = options.argv.indexOf("--request"); const outputIndex = options.argv.indexOf("--output"); const requestPath = options.argv[requestIndex + 1]; const outputPath = options.argv[outputIndex + 1];
      if (requestIndex < 0 || outputIndex < 0 || requestPath === undefined || outputPath === undefined) throw new CliUsageError("plan create requires --request and --output.");
      const plan = new DeterministicExecutionPlanner().create(readJson(resolve(options.cwd, requestPath)) as CreateExecutionPlanInput);
      atomicWrite(resolve(options.cwd, outputPath), plan); options.io.stdout(formatJson(plan)); return 0;
    }
    if (domain === "plan" && action === "inspect") { if (identifier === undefined) throw new CliUsageError("plan inspect requires a path."); options.io.stdout(formatJson(readJson(resolve(options.cwd, identifier)))); return 0; }
    if (domain === "evidence" && (action === "inspect" || action === "verify" || action === "summarize")) {
      if (identifier === undefined) throw new CliUsageError(`evidence ${action} requires a path.`); const evidence = readJson(resolve(options.cwd, identifier)) as EvidenceEnvelope; const service = new DeterministicEvidenceService(); const output = action === "verify" ? service.verify(evidence) : action === "summarize" ? service.summarize({ evidence }) : evidence; options.io.stdout(formatJson(output)); return action === "verify" && !service.verify(evidence).ok ? 1 : 0;
    }

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

    // The connector catalog is only constructed for commands that need it, so
    // read-only commands running in an arbitrary cwd never touch catalog files.
    const catalog = () =>
      new CatalogService(
        new FileSystemConnectorCatalog({ root: options.cwd })
      );

    if (domain === "catalog" && action === "list") {
      const optionArgs = identifier === undefined ? rest : [identifier, ...rest];
      const parsed = parseJsonOption(optionArgs);
      const records = catalog().listConnectors();
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
      const service = catalog();
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
      const service = catalog();
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
      const service = catalog();
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

    if (domain === "config" && action === "show") {
      const optionArgs = identifier === undefined ? rest : [identifier, ...rest];
      const parsed = parseConfigShowOptions(optionArgs);
      const fs = new NodeFileSystem();
      const loaded = new ConfigurationReader({ fs }).loadProjectConfig(
        resolve(options.cwd, parsed.project)
      );
      options.io.stdout(
        parsed.json ? formatJson(loaded) : formatLoadedConfig(loaded)
      );
      return 0;
    }

    if (domain === "policy" && action === "resolve") {
      const optionArgs = identifier === undefined ? rest : [identifier, ...rest];
      const parsed = parsePolicyResolveOptions(optionArgs);
      const fs = new NodeFileSystem();
      const resolved = new PolicyResolver().resolve({
        projectRoot: resolve(options.cwd, parsed.project),
        fs
      });
      options.io.stdout(
        parsed.json ? formatJson(resolved) : formatResolvedPolicy(resolved)
      );
      return 0;
    }

    if (domain === "lock" && action === "inspect") {
      const optionArgs = identifier === undefined ? rest : [identifier, ...rest];
      const parsed = parseLockInspectOptions(optionArgs);
      const fs = new NodeFileSystem();
      const path = resolve(options.cwd, parsed.path);
      const text = fs.readFile(path);
      if (text === undefined) {
        options.io.stderr(`LOCK_NOT_FOUND: no lock file at ${path}\n`);
        return 1;
      }
      const result = new LockfileService().validate(JSON.parse(text));
      if (!result.ok) {
        options.io.stderr(
          `LOCK_INVALID: ${result.issues.join("; ")}\n`
        );
        return 1;
      }
      options.io.stdout(
        parsed.json ? formatJson(result) : formatLock(result.lock)
      );
      return 0;
    }

    if (domain === "lock" && action === "check") {
      const optionArgs = identifier === undefined ? rest : [identifier, ...rest];
      const parsed = parseLockCheckOptions(optionArgs);
      const fs = new NodeFileSystem();
      const lockPath = resolve(options.cwd, parsed.path);
      const text = fs.readFile(lockPath);
      if (text === undefined) {
        options.io.stderr(`LOCK_NOT_FOUND: no lock file at ${lockPath}\n`);
        return 1;
      }
      const lockResult = new LockfileService().validate(JSON.parse(text));
      if (!lockResult.ok) {
        options.io.stderr(
          `LOCK_INVALID: ${lockResult.issues.join("; ")}\n`
        );
        return 1;
      }
      const current = computeCurrentInputs({
        cwd: options.cwd,
        project: parsed.project,
        ...(parsed.routePlan !== undefined
          ? { routePlanPath: parsed.routePlan }
          : {})
      });
      const report = new LockfileService().compare(lockResult.lock, current);
      options.io.stdout(
        parsed.json ? formatJson(report) : formatDrift(report)
      );
      return report.inSync ? 0 : 1;
    }

    if (domain === "lock" && action === "create") {
      const optionArgs = identifier === undefined ? rest : [identifier, ...rest];
      const parsed = parseLockCreateOptions(optionArgs);
      if (parsed.routePlan === undefined) {
        throw new CliUsageError("lock create requires --route-plan <path>.");
      }
      const fs = new NodeFileSystem();
      const outputPath = resolve(options.cwd, parsed.output);
      assertNoParentTraversal(parsed.output);
      if (fs.exists(outputPath) && !parsed.force) {
        options.io.stderr(
          `REFUSED: output already exists (use --force to overwrite): ${outputPath}\n`
        );
        return 1;
      }
      assertNoSymlinkPath(fs, outputPath);
      const current = computeCurrentInputs({
        cwd: options.cwd,
        project: parsed.project,
        routePlanPath: parsed.routePlan
      });
      const lock = new LockfileService().create({
        projectSnapshotId: current.projectSnapshotId,
        catalogSnapshotId: current.catalogSnapshotId,
        policySnapshotId: current.policySnapshotId,
        configDigest: current.configDigest,
        routePlanId: current.routePlanId,
        routePlanDigest: current.routePlanDigest,
        capabilityOntologyVersion: "1.0.0-draft.1",
        connectors: [],
        unavailable: []
      });
      mkdirSync(dirname(outputPath), { recursive: true });
      fs.writeFileAtomic(outputPath, JSON.stringify(lock, null, 2));
      options.io.stdout(parsed.json ? formatJson(lock) : formatLock(lock));
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
    if (error instanceof ConfigLoadError || error instanceof ConfigParseError) {
      options.io.stderr(`${error.code}: ${error.message}\n`);
      return 1;
    }
    if (error instanceof PolicyResolutionError) {
      options.io.stderr(`${error.code}: ${error.message}\n`);
      return 1;
    }
    if (error instanceof LockfileError) {
      options.io.stderr(`${error.code}: ${error.message}\n`);
      return 1;
    }
    options.io.stderr(
      `${error instanceof Error ? error.message : "Unknown Soren SDK failure."}\n`
    );
    return 1;
  }
}
