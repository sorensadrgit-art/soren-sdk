import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Phase9SchemaName =
  | "apply-approval"
  | "apply-request"
  | "apply-result"
  | "rollback-record"
  | "sandbox-policy";

const PHASE9_SCHEMA_FILES: Record<Phase9SchemaName, string> = {
  "apply-approval": "apply-approval.schema.json",
  "apply-request": "apply-request.schema.json",
  "apply-result": "apply-result.schema.json",
  "rollback-record": "rollback-record.schema.json",
  "sandbox-policy": "sandbox-policy.schema.json"
};

function workspaceSchemaCandidates(): string[] {
  const candidates: string[] = [];
  let current = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    candidates.push(join(current, "schemas"));
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return candidates;
}

function schemaDirectories(): string[] {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return [
    join(moduleDirectory, "../../../schemas"),
    ...workspaceSchemaCandidates()
  ];
}

export function loadPhase9Schema(name: Phase9SchemaName): Record<string, unknown> {
  const fileName = PHASE9_SCHEMA_FILES[name];
  for (const directory of schemaDirectories()) {
    try {
      const raw = readFileSync(join(directory, fileName), "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Try the next candidate directory.
    }
  }
  throw new Error(`Unable to locate Phase 9 schema "${name}".`);
}