import { readFileSync, writeFileSync } from "node:fs";

function replaceExact(path, before, after) {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${path}: expected one audited fragment, found ${count}.`);
  }
  writeFileSync(path, source.replace(before, after), "utf8");
}

replaceExact(
  "packages/contracts/src/validation/semantic.ts",
  `const PLACEHOLDER_VERSION =
  /(?:define during implementation|todo|tbd|unknown version|replace[- ]?me)/i;`,
  `const PLACEHOLDER_VERSION =
  /(?:define during implementation|todo|tbd|unknown version|replace[- ]?me)/i;
const REVIEWED_MCP_PROTOCOL_VERSIONS = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
  "2026-07-28"
]);`
);
replaceExact(
  "packages/contracts/src/validation/semantic.ts",
  `function isValidMcpProtocolVersion(value: string): boolean {
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(value.trim());
  if (match === null) return false;
  const year = Number.parseInt(match[1] ?? "0", 10);
  const month = Number.parseInt(match[2] ?? "0", 10);
  const day = Number.parseInt(match[3] ?? "0", 10);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}`,
  `function isValidMcpProtocolVersion(value: string): boolean {
  return REVIEWED_MCP_PROTOCOL_VERSIONS.has(value.trim());
}`
);
replaceExact(
  "packages/contracts/src/validation/semantic.ts",
  `  for (const [index, integration] of manifest.integrations.entries()) {
    const base = \`/integrations/\${index}\`;`,
  `  const integrationIds = new Set<string>();
  for (const [index, integration] of manifest.integrations.entries()) {
    const base = \`/integrations/\${index}\`;
    if (integrationIds.has(integration.id)) {
      issues.push(
        issue(
          \`\${base}/id\`,
          "duplicate-integration-id",
          \`Integration ID "\${integration.id}" must be unique within a connector manifest.\`
        )
      );
    } else {
      integrationIds.add(integration.id);
    }`
);
replaceExact(
  "packages/contracts/src/validation/semantic.ts",
  `          "Available MCP integrations must declare one or more verified YYYY-MM-DD protocol versions."`,
  `          "Available MCP integrations must declare one or more reviewed MCP protocol revisions."`
);

replaceExact(
  "packages/contracts/src/cli/validate-repository.ts",
  `type YamlValue = boolean | null | number | string | Record<string, unknown>;
type YamlRecord = Record<string, YamlValue>;`,
  `type YamlValue = boolean | null | number | string | YamlRecord | YamlValue[];
type YamlRecord = Record<string, YamlValue>;`
);
replaceExact(
  "packages/contracts/src/cli/validate-repository.ts",
  `function splitYamlFlowEntries(value: string, line: number): string[] {
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
      else if (character === "\\\\") escaped = true;
      else if (character === '\"') doubleQuoted = false;
      continue;
    }
    if (singleQuoted) {
      if (character === "'") {
        if (value[index + 1] === "'") index += 1;
        else singleQuoted = false;
      }
      continue;
    }
    if (character === '\"') {
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
}`,
  `function splitYamlFlowEntries(value: string, line: number): string[] {
  const entries: string[] = [];
  let start = 0;
  let mappingDepth = 0;
  let sequenceDepth = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (doubleQuoted) {
      if (escaped) escaped = false;
      else if (character === "\\\\") escaped = true;
      else if (character === '\"') doubleQuoted = false;
      continue;
    }
    if (singleQuoted) {
      if (character === "'") {
        if (value[index + 1] === "'") index += 1;
        else singleQuoted = false;
      }
      continue;
    }
    if (character === '\"') {
      doubleQuoted = true;
      continue;
    }
    if (character === "'") {
      singleQuoted = true;
      continue;
    }
    if (character === "{") mappingDepth += 1;
    else if (character === "}") mappingDepth -= 1;
    else if (character === "[") sequenceDepth += 1;
    else if (character === "]") sequenceDepth -= 1;
    if (mappingDepth < 0 || sequenceDepth < 0) {
      throw new SkillYamlError("Unexpected closing YAML flow delimiter.", line);
    }
    if (character === "," && mappingDepth === 0 && sequenceDepth === 0) {
      entries.push(value.slice(start, index));
      start = index + 1;
    }
  }

  if (
    singleQuoted ||
    doubleQuoted ||
    escaped ||
    mappingDepth !== 0 ||
    sequenceDepth !== 0
  ) {
    throw new SkillYamlError("Unterminated YAML flow collection.", line);
  }
  entries.push(value.slice(start));
  return entries;
}`
);
replaceExact(
  "packages/contracts/src/cli/validate-repository.ts",
  `function parseYamlScalar(value: string, line: number): YamlValue {`,
  `function parseYamlFlowSequence(value: string, line: number): YamlValue[] {
  if (!value.startsWith("[") || !value.endsWith("]")) {
    throw new SkillYamlError("Unterminated YAML flow sequence.", line);
  }
  const inner = value.slice(1, -1).trim();
  if (inner === "") return [];
  return splitYamlFlowEntries(inner, line).map((entry) => {
    const item = entry.trim();
    if (item === "") {
      throw new SkillYamlError("Empty YAML flow sequence entry.", line);
    }
    return parseYamlScalar(item, line);
  });
}

function parseYamlScalar(value: string, line: number): YamlValue {`
);
replaceExact(
  "packages/contracts/src/cli/validate-repository.ts",
  `  if (trimmed.startsWith("{")) {
    return parseYamlFlowMapping(trimmed, line);
  }

  if (/^(?:[-?:](?=\\s)|[,\\[\\]{}#&*!|>%@\`])/.test(trimmed)) {`,
  `  if (trimmed.startsWith("{")) {
    return parseYamlFlowMapping(trimmed, line);
  }

  if (trimmed.startsWith("[")) {
    return parseYamlFlowSequence(trimmed, line);
  }

  if (/^(?:[-?:](?=\\s)|[,\\[\\]{}#&*!|>%@\`])/.test(trimmed)) {`
);

replaceExact(
  "packages/core/src/router/candidates.ts",
  `function dependencyTargetsPackage(value: string, packageName: string): boolean {
  const aliasTarget = npmAliasTarget(value);
  return aliasTarget === null || aliasTarget === packageName;
}`,
  `function dependencyTargetsPackage(value: string, packageName: string): boolean {
  if (value.trim().startsWith("workspace:")) return false;
  const aliasTarget = npmAliasTarget(value);
  return aliasTarget === null || aliasTarget === packageName;
}`
);
replaceExact(
  "packages/core/src/router/candidates.ts",
  `  const id = record.manifest.connector.id;
  const { request, policy } = input;

  if (!PHASE_PROVIDER_IDS.has(id) || !policy.rules.allowedConnectors.includes(id)) {`,
  `  const id = record.manifest.connector.id;
  const { request, policy } = input;
  const integrationIds = record.manifest.integrations.map((integration) => integration.id);
  if (new Set(integrationIds).size !== integrationIds.length) {
    return reject(
      id,
      "CONNECTOR_UNHEALTHY",
      \`Provider "\${id}" contains duplicate integration IDs.\`
    );
  }

  if (!PHASE_PROVIDER_IDS.has(id) || !policy.rules.allowedConnectors.includes(id)) {`
);

replaceExact(
  "packages/core/src/router/route-capabilities-workspace-reuse.ts",
  `function dependencySpec(value: string): DependencySpec {
  let result = value.trim();
  if (result.startsWith("workspace:")) {
    result = result.slice("workspace:".length).trim();
  }
  if (!result.startsWith("npm:")) {`,
  `function dependencySpec(value: string): DependencySpec {
  const result = value.trim();
  if (result.startsWith("workspace:")) {
    return { range: "", aliasTarget: "soren-sdk-workspace-local" };
  }
  if (!result.startsWith("npm:")) {`
);

replaceExact(
  "packages/core/src/router/route-capabilities.ts",
  `  const connectors = records
    .filter(
      (record): record is Extract<ConnectorRecord, { kind: "schema-v2" }> =>
        record.kind === "schema-v2"
    )
    .map((record) => {
      const connectorId = record.manifest.connector.id;
      const health = healthReports.get(connectorId) ?? missingHealth(connectorId);
      return {
        id: connectorId,
        connectorVersion: record.manifest.connectorVersion,
        digest: digestJson(json({ manifest: record.manifest, health })),
        reviewStatus: record.manifest.connector.reviewStatus,
        selectable: record.manifest.connector.selectable
      };
    })`,
  `  const connectors = records
    .map((record) => {
      const connectorId = catalogRecordId(record);
      const health = healthReports.get(connectorId) ?? missingHealth(connectorId);
      if (record.kind === "schema-v2") {
        return {
          id: connectorId,
          connectorVersion: record.manifest.connectorVersion,
          digest: digestJson(json({ manifest: record.manifest, health })),
          reviewStatus: record.manifest.connector.reviewStatus,
          selectable: record.manifest.connector.selectable
        };
      }
      return {
        id: connectorId,
        connectorVersion: "0.0.0-legacy",
        digest: digestJson(json({ record, health })),
        reviewStatus: "blocked" as const,
        selectable: false
      };
    })`
);

replaceExact(
  "packages/cli/src/run.ts",
  `  workspace?: string;
}`,
  `  workspace?: string;
  capabilityWorkspaces: Record<string, string>;
}`
);
replaceExact(
  "packages/cli/src/run.ts",
  `      workspace: { type: "string" },
      json: { type: "boolean", default: false }`,
  `      workspace: { type: "string" },
      "capability-workspace": { type: "string", multiple: true },
      json: { type: "boolean", default: false }`
);
replaceExact(
  "packages/cli/src/run.ts",
  `  const result: RouteCliOptions = {
    project: parsed.values.project ?? ".",
    required,
    optional,
    preferred: unique(parsed.values.preferred ?? []),
    forbidden: unique(parsed.values.forbidden ?? []).sort(),
    maxProviders,
    json: parsed.values.json ?? false
  };`,
  `  const requestedCapabilities = new Set([...required, ...optional]);
  const capabilityWorkspaces: Record<string, string> = {};
  for (const mapping of parsed.values["capability-workspace"] ?? []) {
    const separator = mapping.indexOf("=");
    const capabilityId = mapping.slice(0, separator).trim();
    const workspace = mapping.slice(separator + 1).trim();
    if (separator <= 0 || capabilityId === "" || workspace === "") {
      throw new CliUsageError(
        "--capability-workspace must use <capability-id>=<workspace>."
      );
    }
    if (!requestedCapabilities.has(capabilityId)) {
      throw new CliUsageError(
        "--capability-workspace must reference a requested capability."
      );
    }
    const previous = capabilityWorkspaces[capabilityId];
    if (previous !== undefined && previous !== workspace) {
      throw new CliUsageError(
        \`Conflicting --capability-workspace values for "\${capabilityId}".\`
      );
    }
    capabilityWorkspaces[capabilityId] = workspace;
  }
  const result: RouteCliOptions = {
    project: parsed.values.project ?? ".",
    required,
    optional,
    preferred: unique(parsed.values.preferred ?? []),
    forbidden: unique(parsed.values.forbidden ?? []).sort(),
    maxProviders,
    json: parsed.values.json ?? false,
    capabilityWorkspaces
  };`
);
replaceExact(
  "packages/cli/src/run.ts",
  `  const quality = {
    ...(parsed.scope === undefined ? {} : { scope: parsed.scope }),
    ...(parsed.property === undefined ? {} : { property: parsed.property }),
    ...(parsed.workspace === undefined ? {} : { workspace: parsed.workspace })
  };
  const hasQuality = Object.keys(quality).length > 0;
  const capabilities: RouteRequest["capabilities"] = [
    ...parsed.required.map((id) => ({
      id,
      required: true,
      ...(hasQuality ? { quality } : {})
    })),
    ...parsed.optional.map((id) => ({
      id,
      required: false,
      ...(hasQuality ? { quality } : {})
    }))
  ];`,
  `  const qualityFor = (id: string) => {
    const workspace = parsed.capabilityWorkspaces[id] ?? parsed.workspace;
    const quality = {
      ...(parsed.scope === undefined ? {} : { scope: parsed.scope }),
      ...(parsed.property === undefined ? {} : { property: parsed.property }),
      ...(workspace === undefined ? {} : { workspace })
    };
    return Object.keys(quality).length === 0 ? undefined : quality;
  };
  const capabilityEntry = (id: string, required: boolean) => {
    const quality = qualityFor(id);
    return {
      id,
      required,
      ...(quality === undefined ? {} : { quality })
    };
  };
  const capabilities: RouteRequest["capabilities"] = [
    ...parsed.required.map((id) => capabilityEntry(id, true)),
    ...parsed.optional.map((id) => capabilityEntry(id, false))
  ];`
);
replaceExact(
  "packages/cli/src/run.ts",
  ` [--scope <scope>] [--property <property>] [--workspace <workspace>] [--json]`,
  ` [--scope <scope>] [--property <property>] [--workspace <workspace>] [--capability-workspace <id>=<workspace> ...] [--json]`
);
