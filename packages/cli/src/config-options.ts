import { parseArgs } from "node:util";

export interface ConfigShowOptions {
  json: boolean;
  project: string;
}

export function parseConfigShowOptions(args: string[]): ConfigShowOptions {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: {
      json: { type: "boolean", default: false },
      project: { type: "string" }
    }
  });
  return {
    json: parsed.values.json ?? false,
    project: parsed.values.project ?? "."
  };
}
