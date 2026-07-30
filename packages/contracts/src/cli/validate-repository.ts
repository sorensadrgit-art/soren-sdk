import { readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  ContractValidator,
  digestJson,
  validateCapabilityCatalog,
  validateConnectorManifest,
  type ContractIssue,
  type JsonValue
} from "../index.js";

export interface RepositoryValidationReport {
  errors: Array<{ path: string; issues: readonly ContractIssue[] }>;
  warnings: string[];
  validatedConnectors: string[];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function repositoryIssue(
  keyword: string,
  message: string,
  instancePath = "/"
): ContractIssue {
  return {
    instancePath,
    schemaPath: "#/repository",
    keyword,
    message,
    params: {}
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown repository read error.";
}

function stripYamlString(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseSkillFrontmatter(source: string): {
  fields: Map<string, string>;
  issues: ContractIssue[];
} {
  const normalized = source.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) {
    return {
      fields: new Map(),
      issues: [
        repositoryIssue(
          "skill-frontmatter",
          "Agent Skill must begin with YAML frontmatter."
        )
      ]
    };
  }

  const closing = normalized.indexOf("\n---\n", 4);
  if (closing < 0) {
    return {
      fields: new Map(),
      issues: [
        repositoryIssue(
          "skill-frontmatter",
          "Agent Skill frontmatter is missing a closing delimiter."
        )
      ]
    };
  }

  const fields = new Map<string, string>();
  const issues: ContractIssue[] = [];
  for (const [index, line] of normalized.slice(4, closing).split("\n").entries()) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const match = /^([a-z][a-z0-9-]*):\s*(.+)$/.exec(trimmed);
    if (match === null) {
      issues.push(
        repositoryIssue(
          "skill-frontmatter",
          `Unsupported YAML frontmatter syntax on line ${index + 2}.`
        )
      );
      continue;
    }
    const key = match[1] ?? "";
    if (fields.has(key)) {
      issues.push(
        repositoryIssue(
          "skill-frontmatter",
          `Duplicate Agent Skill frontmatter field "${key}".`
        )
      );
      continue;
    }
    fields.set(key, stripYamlString(match[2] ?? ""));
  }
  return { fields, issues };
}

function isPathInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function validateSkill(
  skillPath: string,
  connectorDirectory: string,
  connectorId: string
): ContractIssue[] {
  let source: string;
  try {
    source = readFileSync(skillPath, "utf8");
  } catch (error) {
    return [
      repositoryIssue(
        "skill-read",
        `Unable to read Agent Skill: ${errorMessage(error)}`
      )
    ];
  }

  const parsed = parseSkillFrontmatter(source);
  const issues = [...parsed.issues];
  if (parsed.issues.some((issue) => issue.keyword === "skill-frontmatter")) {
    return issues;
  }

  const required = [
    "name",
    "description",
    "license",
    "compatibility",
    "source",
    "source-digest"
  ] as const;
  for (const field of required) {
    if ((parsed.fields.get(field) ?? "").trim() === "") {
      issues.push(
        repositoryIssue(
          `skill-${field}`,
          `Agent Skill frontmatter requires a non-empty "${field}" field.`,
          `/${field}`
        )
      );
    }
  }

  const name = parsed.fields.get("name");
  if (
    name !== undefined &&
    (name !== connectorId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
  ) {
    issues.push(
      repositoryIssue(
        "skill-name",
        `Agent Skill name must equal connector ID "${connectorId}" and follow lowercase hyphenated naming rules.`,
        "/name"
      )
    );
  }

  const description = parsed.fields.get("description");
  if (
    description !== undefined &&
    (description.length < 20 || !/\bwhen\b/i.test(description))
  ) {
    issues.push(
      repositoryIssue(
        "skill-description",
        "Agent Skill description must state what the skill does and when to use it.",
        "/description"
      )
    );
  }

  const sourcePathValue = parsed.fields.get("source");
  const sourceDigest = parsed.fields.get("source-digest");
  if (sourcePathValue !== undefined && sourceDigest !== undefined) {
    const sourcePath = resolve(dirname(skillPath), sourcePathValue);
    if (!sourcePathValue.startsWith("./") || !isPathInside(connectorDirectory, sourcePath)) {
      issues.push(
        repositoryIssue(
          "skill-source",
          "Agent Skill source must be a connector-local relative path.",
          "/source"
        )
      );
    } else if (!/^sha256:[0-9a-f]{64}$/.test(sourceDigest)) {
      issues.push(
        repositoryIssue(
          "skill-source-digest",
          "Agent Skill source-digest must be a lowercase SHA-256 digest.",
          "/source-digest"
        )
      );
    } else {
      try {
        const sourceRegistry = readJson(sourcePath) as JsonValue;
        const actualDigest = digestJson(sourceRegistry);
        if (actualDigest !== sourceDigest) {
          issues.push(
            repositoryIssue(
              "skill-source-digest",
              `Agent Skill source-digest does not match ${sourcePathValue}.`,
              "/source-digest"
            )
          );
        }
      } catch (error) {
        issues.push(
          repositoryIssue(
            "skill-source",
            `Unable to read Agent Skill source registry: ${errorMessage(error)}`,
            "/source"
          )
        );
      }
    }
  }

  return issues;
}

export function validateRepository(root: string): RepositoryValidationReport {
  const report: RepositoryValidationReport = {
    errors: [],
    warnings: [],
    validatedConnectors: []
  };

  // Construction validates every registered schema.
  new ContractValidator();

  const capabilityPath = join(root, "capabilities", "catalog.json");
  const capabilityValue = readJson(capabilityPath);
  const capabilityResult = validateCapabilityCatalog(capabilityValue);
  if (!capabilityResult.ok) {
    report.errors.push({
      path: capabilityPath,
      issues: capabilityResult.issues
    });
    return report;
  }

  const connectorRoot = join(root, "sdk-connectors");
  for (const directoryName of readdirSync(connectorRoot).sort()) {
    if (directoryName.startsWith("_")) {
      continue;
    }

    const connectorDirectory = join(connectorRoot, directoryName);
    const manifestPath = join(connectorDirectory, "sdk.manifest.json");
    let value: unknown;
    try {
      value = readJson(manifestPath);
    } catch (error) {
      report.errors.push({
        path: manifestPath,
        issues: [
          repositoryIssue(
            error instanceof SyntaxError ? "manifest-json" : "manifest-read",
            error instanceof SyntaxError
              ? `Connector manifest is not valid JSON: ${errorMessage(error)}`
              : `Unable to read connector manifest: ${errorMessage(error)}`
          )
        ]
      });
      continue;
    }

    if (
      typeof value !== "object" ||
      value === null ||
      !("schemaVersion" in value) ||
      value.schemaVersion !== "2.0.0-draft.1"
    ) {
      report.warnings.push(
        `${manifestPath}: legacy planning manifest skipped until Schema v2 migration.`
      );
      continue;
    }

    const result = validateConnectorManifest(value, {
      expectedPublisher: "soren-sdk",
      capabilityCatalog: capabilityResult.value
    });
    if (!result.ok) {
      report.errors.push({ path: manifestPath, issues: result.issues });
      continue;
    }

    const skillRecord = result.value.relatedFiles.skill;
    if (skillRecord.status === "present") {
      const skillPath = resolve(connectorDirectory, skillRecord.path);
      if (!isPathInside(connectorDirectory, skillPath)) {
        report.errors.push({
          path: skillPath,
          issues: [
            repositoryIssue(
              "skill-path",
              "Agent Skill path escapes the connector directory."
            )
          ]
        });
        continue;
      }
      const skillIssues = validateSkill(
        skillPath,
        connectorDirectory,
        result.value.connector.id
      );
      if (skillIssues.length > 0) {
        report.errors.push({ path: skillPath, issues: skillIssues });
        continue;
      }
    }

    report.validatedConnectors.push(directoryName);
  }

  return report;
}

function formatIssue(issue: ContractIssue): string {
  return `${issue.instancePath || "/"} ${issue.keyword}: ${issue.message}`;
}

async function main(): Promise<void> {
  const root = resolve(process.cwd(), "../..");
  const report = validateRepository(root);

  for (const warning of report.warnings) {
    console.warn(`warning: ${warning}`);
  }

  for (const failure of report.errors) {
    console.error(`error: ${failure.path}`);
    for (const issue of failure.issues) {
      console.error(`  - ${formatIssue(issue)}`);
    }
  }

  console.log(
    `Validated ${report.validatedConnectors.length} Schema v2 connector(s); ` +
      `${report.warnings.length} warning(s); ${report.errors.length} error(s).`
  );

  if (report.errors.length > 0) {
    process.exitCode = 1;
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  await main();
}
