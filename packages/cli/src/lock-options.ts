import { parseArgs } from "node:util";

export interface LockInspectOptions {
  json: boolean;
  path: string;
}

export interface LockCheckOptions {
  json: boolean;
  path: string;
  project: string;
  routePlan?: string;
}

export interface LockCreateOptions {
  json: boolean;
  project: string;
  output: string;
  routePlan?: string;
  force: boolean;
}

export function parseLockInspectOptions(args: string[]): LockInspectOptions {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      json: { type: "boolean", default: false }
    }
  });
  if (parsed.positionals.length > 1) {
    throw new TypeError("lock inspect accepts at most one lock file path.");
  }
  return {
    json: parsed.values.json ?? false,
    path: parsed.positionals[0] ?? "."
  };
}

export function parseLockCheckOptions(args: string[]): LockCheckOptions {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      json: { type: "boolean", default: false },
      project: { type: "string" },
      "route-plan": { type: "string" }
    }
  });
  if (parsed.positionals.length > 1) {
    throw new TypeError("lock check accepts at most one lock file path.");
  }
  const routePlan = parsed.values["route-plan"];
  return {
    json: parsed.values.json ?? false,
    path: parsed.positionals[0] ?? ".",
    project: parsed.values.project ?? ".",
    ...(routePlan !== undefined ? { routePlan } : {})
  };
}

export function parseLockCreateOptions(args: string[]): LockCreateOptions {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      json: { type: "boolean", default: false },
      project: { type: "string" },
      output: { type: "string" },
      "route-plan": { type: "string" },
      force: { type: "boolean", default: false }
    }
  });
  const project = parsed.values.project;
  const output = parsed.values.output;
  if (project === undefined) {
    throw new TypeError("lock create requires --project <path>.");
  }
  if (output === undefined) {
    throw new TypeError("lock create requires --output <path>.");
  }
  const routePlan = parsed.values["route-plan"];
  return {
    json: parsed.values.json ?? false,
    project,
    output,
    force: parsed.values.force ?? false,
    ...(routePlan !== undefined ? { routePlan } : {})
  };
}
