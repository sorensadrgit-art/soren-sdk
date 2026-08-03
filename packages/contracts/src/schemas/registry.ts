import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CONTRACT_SCHEMA_FILES = {
  "capability-catalog": "capability-catalog.schema.json",
  "artifact-reference": "artifact-reference.schema.json",
  "catalog-snapshot": "catalog-snapshot.schema.json",
  connector: "connector.schema.json",
  "error-envelope": "error-envelope.schema.json",
  "evidence-envelope": "evidence-envelope.schema.json",
  "execution-plan": "execution-plan.schema.json",
  policy: "policy.schema.json",
  "project-snapshot": "project-snapshot.schema.json",
  "route-plan": "route-plan.schema.json",
  "route-request": "route-request.schema.json",
  "runner-result": "runner-result.schema.json",
  "soren-config": "soren-config.schema.json",
  "soren-sdk-lock": "soren-sdk-lock.schema.json",
  "verification-plan": "verification-plan.schema.json"
} as const;

export type ContractSchemaName = keyof typeof CONTRACT_SCHEMA_FILES;
export type JsonSchemaObject = Record<string, unknown>;

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

function candidateSchemaDirectories(): string[] {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));

  return [
    join(moduleDirectory, "../schema-data"),
    ...workspaceSchemaCandidates()
  ];
}

export function findSchemaDirectory(): string {
  for (const directory of candidateSchemaDirectories()) {
    try {
      const names = new Set(readdirSync(directory));
      if (Object.values(CONTRACT_SCHEMA_FILES).every((name) => names.has(name))) {
        return directory;
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error("Unable to locate the Soren SDK schema directory.");
}

export function loadSchema(name: ContractSchemaName): JsonSchemaObject {
  const path = join(findSchemaDirectory(), CONTRACT_SCHEMA_FILES[name]);
  return JSON.parse(readFileSync(path, "utf8")) as JsonSchemaObject;
}

export function loadAllSchemas(): ReadonlyMap<ContractSchemaName, JsonSchemaObject> {
  return new Map(
    (Object.keys(CONTRACT_SCHEMA_FILES) as ContractSchemaName[]).map((name) => [
      name,
      loadSchema(name)
    ])
  );
}
