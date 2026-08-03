import { parseArgs } from "node:util";

export interface PolicyResolveOptions {
  json: boolean;
  project: string;
}

export function parsePolicyResolveOptions(args: string[]): PolicyResolveOptions {
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
