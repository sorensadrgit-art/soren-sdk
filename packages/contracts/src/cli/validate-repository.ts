import { readFileSync, readdirSync, realpathSync } from "node:fs";
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

const SEMANTIC_VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const YAML_DOUBLE_ESCAPES: Readonly<Record<string, string>> = {
  "0": "\0",
  a: "\u0007",
  b: "\b",
  t: "\t",
  n: "\n",
  v: "\v",
  f: "\f",
  r: "\r",
  e: "\u001b",
  " ": " ",
  '"': '"',
  "/": "/",
  "\\": "\\",
  N: "\u0085",
  _: "\u00a0",
  L: "\u2028",
  P: "\u2029"
};

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

function isValidSemanticVersion(value: string): boolean {
  const match = SEMANTIC_VERSION.exec(value.trim());
  if (match === null) return false;
  const prerelease = match[4];
  if (prerelease === undefined) return true;
  return prerelease.split(".").every(
    (identifier) =>
      !/^\d+$/.test(identifier) ||
      identifier === "0" ||
      !identifier.startsWith("0")
  );
}

function startsQuotedScalar(value: string, index: number): boolean {
  const prefix = value.slice(0, index).trimEnd();
  if (prefix === "") return true;
  const separator = prefix.lastIndexOf(":");
  return separator >= 0 && prefix.slice(separator + 1).trim() === "";
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
    if (character === '"' && startsQuotedScalar(value, index)) {
      doubleQuoted = true;
      continue;
    }
    if (character === "'" && startsQuotedScalar(value, index)) {
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

function parseSingleQuotedYamlScalar(value: string, line: number): string {
  let parsed = "";
  for (let index = 1; index < value.length; index += 1) {
    const character = value[index];
    if (character !== "'") {
      parsed += character;
      continue;
    }
    if (value[index + 1] === "'") {
      parsed += "'";
      index += 1;
      continue;
    }
    if (value.slice(index + 1).trim() !== "") {
      throw new SkillYamlError(
        "Unexpected trailing content after single-quoted YAML scalar.",
        line
      );
    }
    return parsed;
  }
  throw new SkillYamlError("Unterminated single-quoted YAML scalar.", line);
}

function parseDoubleQuotedYamlScalar(value: string, line: number): string {
  if (!value.endsWith('"') || value.length < 2) {
    throw new SkillYamlError("Unterminated double-quoted YAML scalar.", line);
  }
  let parsed = "";
  for (let index = 1; index < value.length - 1; index += 1) {
    const character = value[index];
    if (character === '"') {
      throw new SkillYamlError(
        "Unescaped quote inside double-quoted YAML scalar.",
        line
      );
    }
    if (character !== "\\") {
      parsed += character;
      continue;
    }

    const escape = value[index + 1];
    if (escape === undefined || index + 1 >= value.length - 1) {
      throw new SkillYamlError("Incomplete YAML escape sequence.", line);
    }
    index += 1;
    const mapped = YAML_DOUBLE_ESCAPES[escape];
    if (mapped !== undefined) {
      parsed += mapped;
      continue;
    }

    const digits = escape === "x" ? 2 : escape === "u" ? 4 : escape === "U" ? 8 : 0;
    if (digits === 0) {
      throw new SkillYamlError(`Unsupported YAML escape sequence \\${escape}.`, line);
    }
    const hex = value.slice(index + 1, index + 1 + digits);
    if (hex.length !== digits || !/^[0-9a-f]+$/i.test(hex)) {
      throw new SkillYamlError("Invalid hexadecimal YAML escape sequence.", line);
    }
    const codePoint = Number.parseInt(hex, 16);
    if (
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      throw new SkillYamlError("Invalid Unicode YAML escape sequence.", line);
    }
    parsed += String.fromCodePoint(codePoint);
    index += digits;
  }
  return parsed;
}

function parseYamlNumber(value: string): number | undefined {
  const sign = value.startsWith("-") ? -1 : 1;
  const unsigned = value.replace(/^[+-]/, "");

  if (/^\.inf$/i.test(unsigned)) return sign * Number.POSITIVE_INFINITY;
  if (/^\.nan$/i.test(unsigned)) return Number.NaN;

  const basedNumbers = [
    { pattern: /^0x[0-9a-f](?:_?[0-9a-f])*$/i, radix: 16 },
    { pattern: /^0o[0-7](?:_?[0-7])*$/i, radix: 8 },
    { pattern: /^0b[01](?:_?[01])*$/i, radix: 2 }
  ] as const;
  for (const { pattern, radix } of basedNumbers) {
    if (!pattern.test(unsigned)) continue;
    const normalized = unsigned.replaceAll("_", "");
    return sign * Number.parseInt(normalized.slice(2), radix);
  }

  const decimal = /^[+-]?(?:(?:\d(?:_?\d)*)(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:e[+-]?\d(?:_?\d)*)?$/i;
  return decimal.test(value) ? Number(value.replaceAll("_", "")) : undefined;
}

function splitYamlFlowEntries(value: string, line: number): string[] {
  const entries: string[] = [];
  let start = 0;
  let depth = 0;
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
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character === "}") {
      depth -= 1;
      if (depth < 0) {
        throw new SkillYamlError("Unexpected closing YAML flow mapping brace.", line);
      }
      continue;
    }
    if (character === "[" || character === "]") {
      throw new SkillYamlError("YAML flow sequences are not supported.", line);
    }
    if (character === "," && depth === 0) {
      entries.push(value.slice(start, index));
      start = index + 1;
    }
  }

  if (singleQuoted || doubleQuoted || escaped || depth !== 0) {
    throw new SkillYamlError("Unterminated YAML flow mapping.", line);
  }
  entries.push(value.slice(start));
  return entries;
}

function yamlFlowSeparator(entry: string, line: number): number {
  let depth = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  let escaped = false;

  for (let index = 0; index < entry.length; index += 1) {
    const character = entry[index];
    if (doubleQuoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') doubleQuoted = false;
      continue;
    }
    if (singleQuoted) {
      if (character === "'") {
        if (entry[index + 1] === "'") index += 1;
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
    if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;
    else if (character === ":" && depth === 0) return index;
  }

  throw new SkillYamlError("Expected a colon in YAML flow mapping entry.", line);
}

function parseYamlFlowKey(value: string, line: number): string {
  const key = value.trim();
  if (key.startsWith('"')) return parseDoubleQuotedYamlScalar(key, line);
  if (key.startsWith("'")) return parseSingleQuotedYamlScalar(key, line);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) {
    throw new SkillYamlError("Invalid YAML flow mapping key.", line);
  }
  return key;
}

function parseYamlFlowMapping(value: string, line: number): YamlRecord {
  if (!value.startsWith("{") || !value.endsWith("}")) {
    throw new SkillYamlError("Unterminated YAML flow mapping.", line);
  }
  const inner = value.slice(1, -1).trim();
  if (inner === "") return {};

  const record: YamlRecord = {};
  const entries = splitYamlFlowEntries(inner, line);
  for (const [index, rawEntry] of entries.entries()) {
    const entry = rawEntry.trim();
    if (entry === "" && index === entries.length - 1 && inner.endsWith(",")) {
      continue;
    }
    if (entry === "") {
      throw new SkillYamlError("Empty YAML flow mapping entry.", line);
    }
    const separator = yamlFlowSeparator(entry, line);
    const key = parseYamlFlowKey(entry.slice(0, separator), line);
    if (Object.hasOwn(record, key)) {
      throw new SkillYamlError(`Duplicate YAML key "${key}".`, line);
    }
    const rawValue = entry.slice(separator + 1).trim();
    if (rawValue === "") {
      throw new SkillYamlError("Expected a YAML flow mapping value.", line);
    }
    record[key] = rawValue.startsWith("{")
      ? parseYamlFlowMapping(rawValue, line)
      : parseYamlScalar(rawValue, line);
  }
  return record;
}

function parseYamlScalar(value: string, line: number): YamlValue {
  const trimmed = stripYamlComment(value, line).trim();
  if (trimmed === "") {
    throw new SkillYamlError("Expected a YAML scalar value.", line);
  }

  if (trimmed.startsWith('"')) {
    return parseDoubleQuotedYamlScalar(trimmed, line);
  }

  if (trimmed.startsWith("'")) {
    return parseSingleQuotedYamlScalar(trimmed, line);
  }

  if (trimmed.startsWith("{")) {
    return parseYamlFlowMapping(trimmed, line);
  }

  if (/^(?:[-?:](?=\s)|[,\[\]{}#&*!|>%@`])/.test(trimmed)) {
    throw new SkillYamlError(
      "Unsupported YAML collection, tag, anchor, alias, indicator, or block scalar.",
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
  const numeric = parseYamlNumber(trimmed);
  if (numeric !== undefined) return numeric;
  return trimmed;
}

function leadingSpaces(value: string): number {
  return /^ */.exec(value)?.[0].length ?? 0;
}

function foldBlockLines(lines: readonly string[]): string {
  let result = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const next = lines[index + 1];
    result += line;
    if (next !== undefined) {
      result += line === "" || next === "" ? "\n" : " ";
    }
  }
  return result;
}

function applyBlockChomping(value: string, chomping: string | undefined): string {
  if (chomping === "-") return value.replace(/\n+$/, "");
  if (chomping === "+") return `${value}\n`;
  return `${value.replace(/\n+$/, "")}\n`;
}

function hasClosingQuotedScalar(
  value: string,
  quote: "\"" | "'"
): boolean {
  let escaped = false;
  for (let index = 1; index < value.length; index += 1) {
    const character = value[index];
    if (quote === "\"") {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === quote) return true;
      continue;
    }
    if (character !== quote) continue;
    if (value[index + 1] === quote) {
      index += 1;
      continue;
    }
    return true;
  }
  return false;
}

function normalizeYamlMultilineQuotedScalars(source: string): string {
  const lines = source.split("\n");
  const output: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const originalLine = lines[index] ?? "";
    const match = /^(( *)([A-Za-z][A-Za-z0-9_-]*):\s*)((?:"|').*)$/.exec(
      originalLine
    );
    const scalarStart = match?.[4]?.[0];
    const quote = scalarStart === "\"" || scalarStart === "'"
      ? scalarStart
      : null;
    if (
      match === null ||
      quote === null ||
      hasClosingQuotedScalar(match[4] ?? quote, quote)
    ) {
      output.push(originalLine);
      continue;
    }

    const baseIndent = (match[2] ?? "").length;
    let scalar = match[4] ?? quote;
    let cursor = index + 1;
    let previousBlank = false;
    while (
      cursor < lines.length &&
      !hasClosingQuotedScalar(scalar, quote)
    ) {
      const line = lines[cursor] ?? "";
      if (line.includes("\t")) {
        throw new SkillYamlError(
          "Tabs are not allowed in multiline YAML scalar indentation.",
          cursor + 1
        );
      }
      if (line.trim() === "") {
        scalar += "\n";
        previousBlank = true;
        cursor += 1;
        continue;
      }
      if (leadingSpaces(line) <= baseIndent) break;
      scalar += `${previousBlank ? "" : " "}${line.trim()}`;
      previousBlank = false;
      cursor += 1;
    }
    if (!hasClosingQuotedScalar(scalar, quote)) {
      throw new SkillYamlError(
        "Unterminated multiline quoted YAML scalar.",
        index + 1
      );
    }
    output.push(`${match[1] ?? ""}${scalar}`);
    for (let consumed = index + 1; consumed < cursor; consumed += 1) {
      output.push("");
    }
    index = cursor - 1;
  }
  return output.join("\n");
}

function normalizeYamlBlockScalars(source: string): string {
  const lines = source.split("\n");
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const originalLine = lines[index] ?? "";
    const match = /^(( *)([A-Za-z][A-Za-z0-9_-]*):)\s*([>|])(?:(?:([1-9])([+-])?)|(?:([+-])([1-9])?))?\s*(?:#.*)?$/.exec(
      originalLine
    );
    if (match === null) {
      output.push(originalLine);
      continue;
    }

    const baseIndent = (match[2] ?? "").length;
    const indentationIndicator = match[5] ?? match[8];
    const chomping = match[6] ?? match[7];
    let blockIndent: number | null =
      indentationIndicator === undefined
        ? null
        : baseIndent + Number.parseInt(indentationIndicator, 10);
    let cursor = index + 1;
    while (cursor < lines.length) {
      const line = lines[cursor] ?? "";
      if (line.includes("\t")) {
        throw new SkillYamlError(
          "Tabs are not allowed in YAML block scalar indentation.",
          cursor + 1
        );
      }
      if (line.trim() === "") {
        cursor += 1;
        continue;
      }
      const indentation = leadingSpaces(line);
      if (indentation <= baseIndent) break;
      if (blockIndent === null) blockIndent = indentation;
      else if (indentation < blockIndent) {
        throw new SkillYamlError(
          "YAML block scalar content is less indented than its explicit indicator.",
          cursor + 1
        );
      }
      break;
    }
    if (blockIndent === null) {
      throw new SkillYamlError(
        "YAML block scalar requires indented content.",
        index + 1
      );
    }

    const blockLines: string[] = [];
    cursor = index + 1;
    while (cursor < lines.length) {
      const line = lines[cursor] ?? "";
      if (line.includes("\t")) {
        throw new SkillYamlError(
          "Tabs are not allowed in YAML block scalar indentation.",
          cursor + 1
        );
      }
      if (line.trim() === "") {
        blockLines.push("");
        cursor += 1;
        continue;
      }
      const indentation = leadingSpaces(line);
      if (indentation < blockIndent) break;
      blockLines.push(line.slice(blockIndent));
      cursor += 1;
    }

    const style = match[4] ?? ">";
    const blockValue =
      style === "|" ? blockLines.join("\n") : foldBlockLines(blockLines);
    const value = applyBlockChomping(blockValue, chomping);
    output.push(`${match[1] ?? ""} ${JSON.stringify(value)}`);
    for (let consumed = index + 1; consumed < cursor; consumed += 1) {
      output.push("");
    }
    index = cursor - 1;
  }

  return output.join("\n");
}

function parseYamlMapping(source: string): YamlRecord {
  const root: YamlRecord = {};
  const stack: Array<{
    indent: number;
    record: YamlRecord;
    childIndent: number | null;
  }> = [{ indent: -1, record: root, childIndent: 0 }];

  for (const [index, originalLine] of source.split("\n").entries()) {
    const lineNumber = index + 1;
    if (originalLine.includes("\t")) {
      throw new SkillYamlError("Tabs are not allowed in YAML indentation.", lineNumber);
    }
    const withoutComment = stripYamlComment(originalLine, lineNumber);
    if (withoutComment.trim() === "") continue;

    const indentation = leadingSpaces(withoutComment);
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
    if (parent === undefined || indentation <= parent.indent) {
      throw new SkillYamlError("Invalid YAML mapping indentation.", lineNumber);
    }
    if (parent.childIndent === null) parent.childIndent = indentation;
    else if (indentation !== parent.childIndent) {
      throw new SkillYamlError("Inconsistent YAML mapping indentation.", lineNumber);
    }

    const key = match[1] ?? "";
    if (Object.hasOwn(parent.record, key)) {
      throw new SkillYamlError(`Duplicate YAML key "${key}".`, lineNumber);
    }
    const rawValue = match[2];
    if (rawValue === undefined || rawValue.trim() === "") {
      const nested: YamlRecord = {};
      parent.record[key] = nested;
      stack.push({
        indent: indentation,
        record: nested,
        childIndent: null
      });
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
    const frontmatter = normalizeYamlBlockScalars(
      normalizeYamlMultilineQuotedScalars(normalized.slice(4, closing))
    );
    return {
      value: parseYamlMapping(frontmatter),
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

function isRealPathInside(root: string, candidate: string): boolean {
  try {
    return isPathInside(realpathSync(root), realpathSync(candidate));
  } catch {
    return false;
  }
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
    const version = metadata.version;
    const connectorVersion = metadata["connector-version"];
    if (
      version !== undefined &&
      connectorVersion !== undefined &&
      version !== connectorVersion
    ) {
      issues.push(
        repositoryIssue(
          "skill-metadata-version",
          "Agent Skill metadata.version and metadata.connector-version must match when both are provided.",
          "/metadata"
        )
      );
    }
    const metadataVersion = version ?? connectorVersion;
    const metadataVersionPath =
      version !== undefined
        ? "/metadata/version"
        : "/metadata/connector-version";
    if (
      typeof metadataVersion !== "string" ||
      !isValidSemanticVersion(metadataVersion)
    ) {
      issues.push(
        repositoryIssue(
          "skill-metadata-version",
          "Agent Skill metadata.version or metadata.connector-version must be a semantic version string.",
          metadataVersionPath
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
      !isPathInside(connectorDirectory, sourcePath) ||
      !isRealPathInside(connectorDirectory, sourcePath)
    ) {
      issues.push(
        repositoryIssue(
          "skill-source",
          "Agent Skill source must resolve to a connector-local relative path.",
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
      if (
        !isPathInside(connectorDirectory, skillPath) ||
        !isRealPathInside(connectorDirectory, skillPath)
      ) {
        report.errors.push({
          path: skillPath,
          issues: [
            repositoryIssue(
              "skill-path",
              "Agent Skill path must resolve inside the connector directory."
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
