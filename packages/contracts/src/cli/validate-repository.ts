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

type YamlValue = boolean | null | number | string | Record<string, unknown>;
type YamlRecord = Record<string, YamlValue>;

class SkillYamlError extends Error {
  override readonly name = "SkillYamlError";

  constructor(
    message: string,
    readonly line: number
  ) {
    super(message);
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripYamlComment(value: string, line: number): string {
  let singleQuoted = false;
  let doubleQuoted = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (doubleQuoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') doubleQuoted = false;
      continue;
    }
    if (singleQuoted) {
      if (character === "'") {
        if (value[index + 1] === "'") index += 1;
        else singleQuoted = false;
      }
      continue;
    }
    if (character === '"') {
      doubleQuoted = true;
      continue;
    }
    if (character === "'") {
      singleQuoted = true;
      continue;
    }
    if (
      character === "#" &&
      (index === 0 || /\s/.test(value[index - 1] ?? ""))
    ) {
      return value.slice(0, index).trimEnd();
    }
  }

  if (singleQuoted || doubleQuoted || escaped) {
    throw new SkillYamlError("Unterminated quoted YAML scalar.", line);
  }
  return value;
}

function parseYamlScalar(value: string, line: number): YamlValue {
  const trimmed = stripYamlComment(value, line).trim();
  if (trimmed === "") {
    throw new SkillYamlError("Expected a YAML scalar value.", line);
  }

  if (trimmed.startsWith('"')) {
    if (!trimmed.endsWith('"') || trimmed.length < 2) {
      throw new SkillYamlError("Unterminated double-quoted YAML scalar.", line);
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (typeof parsed !== "string") {
        throw new SkillYamlError("Quoted YAML scalar must be a string.", line);
      }
      return parsed;
    } catch (error) {
      if (error instanceof SkillYamlError) throw error;
      throw new SkillYamlError(
        `Invalid double-quoted YAML scalar: ${errorMessage(error)}`,
        line
      );
    }
  }

  if (trimmed.startsWith("'")) {
    if (!trimmed.endsWith("'") || trimmed.length < 2) {
      throw new SkillYamlError("Unterminated single-quoted YAML scalar.", line);
    }
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }

  if (/^[\[{&*!|>@`]/.test(trimmed)) {
    throw new SkillYamlError(
      "Unsupported YAML collection, tag, anchor, alias, or block scalar.",
      line
    );
  }
  if (/:\s/.test(trimmed)) {
    throw new SkillYamlError(
      "Unquoted YAML plain scalars cannot contain a colon followed by whitespace.",
      line
    );
  }
  if (/^(?:null|~)$/i.test(trimmed)) return null;
  if (/^(?:true|false)$/i.test(trimmed)) {
    return trimmed.toLowerCase() === "true";
  }
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
}

function parseYamlMapping(source: string): YamlRecord {
  const root: YamlRecord = {};
  const stack: Array<{ indent: number; record: YamlRecord }> = [
    { indent: -2, record: root }
  ];

  for (const [index, originalLine] of source.split("\n").entries()) {
    const lineNumber = index + 1;
    if (originalLine.includes("\t")) {
      throw new SkillYamlError("Tabs are not allowed in YAML indentation.", lineNumber);
    }
    const withoutComment = stripYamlComment(originalLine, lineNumber);
    if (withoutComment.trim() === "") continue;

    const indentation = /^ */.exec(withoutComment)?.[0].length ?? 0;
    if (indentation % 2 !== 0) {
      throw new SkillYamlError(
        "YAML mappings must use two-space indentation.",
        lineNumber
      );
    }
    const content = withoutComment.slice(indentation);
    const match = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s+(.*))?$/.exec(content);
    if (match === null) {
      throw new SkillYamlError(
        "Expected a YAML mapping entry in key: value form.",
        lineNumber
      );
    }

    while (
      stack.length > 1 &&
      indentation <= (stack[stack.length - 1]?.indent ?? -2)
    ) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent === undefined || indentation !== parent.indent + 2) {
      throw new SkillYamlError("Invalid YAML mapping indentation.", lineNumber);
    }

    const key = match[1] ?? "";
    if (Object.hasOwn(parent.record, key)) {
      throw new SkillYamlError(`Duplicate YAML key "${key}".`, lineNumber);
    }
    const rawValue = match[2];
    if (rawValue === undefined || rawValue.trim() === "") {
      const nested: YamlRecord = {};
      parent.record[key] = nested;
      stack.push({ indent: indentation, record: nested });
    } else {
      parent.record[key] = parseYamlScalar(rawValue, lineNumber);
    }
  }

  return root;
}

function parseSkillFrontmatter(source: string): {
  value: YamlRecord | null;
  issues: ContractIssue[];
} {
  const normalized = source.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) {
    return {
      value: null,
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
      value: null,
      issues: [
        repositoryIssue(
          "skill-frontmatter",
          "Agent Skill frontmatter is missing a closing delimiter."
        )
      ]
    };
  }

  try {
    return {
      value: parseYamlMapping(normalized.slice(4, closing)),
      issues: []
    };
  } catch (error) {
    const line = error instanceof SkillYamlError ? error.line : 0;
    return {
      value: null,
      issues: [
        repositoryIssue(
          "skill-frontmatter",
          `${errorMessage(error)}${line > 0 ? ` Frontmatter line ${line}.` : ""}`
        )
      ]
    };
  }
}

function isPathInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function yamlString(
  value: YamlRecord,
  field: string,
  issues: ContractIssue[]
): string | null {
  const candidate = value[field];
  if (typeof candidate !== "string" || candidate.trim() === "") {
    issues.push(
      repositoryIssue(
        `skill-${field}`,
        `Agent Skill frontmatter requires a non-empty string "${field}" field.`,
        `/${field}`
      )
    );
    return null;
  }
  return candidate.trim();
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
  if (parsed.value === null) return issues;

  const name = yamlString(parsed.value, "name", issues);
  const description = yamlString(parsed.value, "description", issues);
  yamlString(parsed.value, "license", issues);
  yamlString(parsed.value, "compatibility", issues);
  const sourcePathValue = yamlString(parsed.value, "source", issues);
  const sourceDigest = yamlString(parsed.value, "source-digest", issues);

  const metadata = parsed.value.metadata;
  if (!isRecord(metadata)) {
    issues.push(
      repositoryIssue(
        "skill-metadata",
        "Agent Skill frontmatter requires a nested metadata mapping.",
        "/metadata"
      )
    );
  } else {
    if (metadata.publisher !== "soren-sdk") {
      issues.push(
        repositoryIssue(
          "skill-metadata-publisher",
          'Agent Skill metadata.publisher must be "soren-sdk".',
          "/metadata/publisher"
        )
      );
    }
    if (
      typeof metadata.version !== "string" ||
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
        metadata.version
      )
    ) {
      issues.push(
        repositoryIssue(
          "skill-metadata-version",
          "Agent Skill metadata.version must be a semantic version string.",
          "/metadata/version"
        )
      );
    }
  }

  if (
    name !== null &&
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

  if (
    description !== null &&
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

  if (sourcePathValue !== null && sourceDigest !== null) {
    const sourcePath = resolve(dirname(skillPath), sourcePathValue);
    if (
      !sourcePathValue.startsWith("./") ||
      !isPathInside(connectorDirectory, sourcePath)
    ) {
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
        if (digestJson(sourceRegistry) !== sourceDigest) {
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

  new ContractValidator();

  const capabilityPath = join(root, "capabilities", "catalog.json");
  const capabilityResult = validateCapabilityCatalog(readJson(capabilityPath));
  if (!capabilityResult.ok) {
    report.errors.push({
      path: capabilityPath,
      issues: capabilityResult.issues
    });
    return report;
  }

  const connectorRoot = join(root, "sdk-connectors");
  for (const directoryName of readdirSync(connectorRoot).sort()) {
    if (directoryName.startsWith("_")) continue;

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

  for (const warning of report.warnings) console.warn(`warning: ${warning}`);
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
  if (report.errors.length > 0) process.exitCode = 1;
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) await main();
