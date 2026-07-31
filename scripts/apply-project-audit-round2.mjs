import { readFileSync, writeFileSync } from "node:fs";

function replaceExact(path, before, after) {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${path}: expected one audited fragment, found ${count}.`);
  }
  writeFileSync(path, source.replace(before, after), "utf8");
}

function replaceCount(path, before, after, expected) {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== expected) {
    throw new Error(`${path}: expected ${expected} audited fragments, found ${count}.`);
  }
  writeFileSync(path, source.split(before).join(after), "utf8");
}

replaceExact(
  "packages/contracts/src/cli/validate-repository.ts",
  `function leadingSpaces(value: string): number {
  return /^ */.exec(value)?.[0].length ?? 0;
}`,
  `function leadingSpaces(value: string): number {
  return /^ */.exec(value)?.[0].length ?? 0;
}

function hasTabIndentation(value: string): boolean {
  return (/^[ \\t]*/.exec(value)?.[0] ?? "").includes("\\t");
}`
);
replaceCount(
  "packages/contracts/src/cli/validate-repository.ts",
  `if (line.includes("\\t")) {`,
  `if (hasTabIndentation(line)) {`,
  3
);
replaceExact(
  "packages/contracts/src/cli/validate-repository.ts",
  `if (originalLine.includes("\\t")) {`,
  `if (hasTabIndentation(originalLine)) {`
);

replaceExact(
  "packages/core/src/router/candidates.ts",
  `function versionSatisfiesRange(version: Version, range: string): boolean {
  return rangeIntervals(range).some((interval) =>
    intervalContains(interval, version)
  );
}`,
  `function versionSatisfiesRange(version: Version, range: string): boolean {
  const normalized = normalizeRange(range);
  if (/(?:^|[\\s|,])(?:[~^<>=]*v?)?\\d+\\.\\d+\\.\\d+-[0-9A-Za-z]/.test(normalized)) {
    return false;
  }
  return rangeIntervals(normalized).some((interval) =>
    intervalContains(interval, version)
  );
}`
);

replaceExact(
  "packages/core/src/router/route-capabilities-workspace-reuse.ts",
  `  const hasUnscoped = required.some(
    (capability) =>
      typeof capability.quality?.workspace !== "string" ||
      capability.quality.workspace.trim().length === 0
  );
  return hasUnscoped ? [...routeWorkspaces] : explicit;`,
  `  const hasUnscoped = required.some(
    (capability) =>
      typeof capability.quality?.workspace !== "string" ||
      capability.quality.workspace.trim().length === 0
  );
  const targets = new Set(explicit);
  if (hasUnscoped) targets.add(".");
  return [...targets].sort();`
);
replaceExact(
  "packages/core/src/router/route-capabilities-workspace-reuse.ts",
  `function requestedWorkspaces(request: RouteRequest): string[] {
  return [
    ...new Set(
      request.capabilities
        .filter((capability) => capability.required)
        .map((capability) => capability.quality?.workspace)
        .filter(
          (workspace): workspace is string =>
            typeof workspace === "string" && workspace.trim().length > 0
        )
        .map((workspace) => workspace.trim())
    )
  ].sort();
}`,
  `function requestedWorkspaces(request: RouteRequest): string[] {
  const required = request.capabilities.filter((capability) => capability.required);
  const workspaces = new Set(
    required
      .map((capability) => capability.quality?.workspace)
      .filter(
        (workspace): workspace is string =>
          typeof workspace === "string" && workspace.trim().length > 0
      )
      .map((workspace) => workspace.trim())
  );
  if (
    required.some(
      (capability) =>
        typeof capability.quality?.workspace !== "string" ||
        capability.quality.workspace.trim().length === 0
    )
  ) {
    workspaces.add(".");
  }
  return [...workspaces].sort();
}`
);

replaceExact(
  "packages/core/src/router/route-capabilities-security.ts",
  `import type { CatalogReader, ConnectorRecord } from "../catalog/types.js";`,
  `import type {
  CatalogReader,
  ConnectorHealthReport,
  ConnectorRecord
} from "../catalog/types.js";`
);
replaceExact(
  "packages/core/src/router/route-capabilities-security.ts",
  `function assertProjectSnapshotDigest(project: ProjectSnapshot): void {`,
  `function recordId(record: ConnectorRecord): string {
  return record.kind === "schema-v2"
    ? record.manifest.connector.id
    : record.directoryId;
}

function freezeCatalog(catalog: CatalogReader): CatalogReader {
  const capabilities = structuredClone(catalog.getCapabilityCatalog());
  const records = catalog.list().map((record) => structuredClone(record));
  const health = new Map<string, ConnectorHealthReport>();
  const recordsById = new Map<string, ConnectorRecord>();
  for (const record of records) {
    const id = recordId(record);
    recordsById.set(record.directoryId, record);
    recordsById.set(id, record);
    if (!health.has(id)) health.set(id, structuredClone(catalog.health(id)));
  }
  const snapshot = structuredClone(catalog.snapshot());
  return {
    getCapabilityCatalog: () => capabilities,
    list: () => [...records],
    get: (connectorId) => recordsById.get(connectorId),
    health: (connectorId) =>
      health.get(connectorId) ?? {
        connectorId,
        state: "missing",
        selectable: false,
        reviewStatus: null,
        blockers: [],
        warnings: [],
        errors: ["missing"]
      },
    snapshot: (createdAt = snapshot.createdAt) => ({
      ...snapshot,
      createdAt,
      connectors: snapshot.connectors.map((connector) => ({ ...connector }))
    })
  };
}

function assertProjectSnapshotDigest(project: ProjectSnapshot): void {`
);
replaceExact(
  "packages/core/src/router/route-capabilities-security.ts",
  `  return record.manifest.ownershipClaims.some(
    (claim) =>
      claim.domain === requirement.domain &&
      claim.properties?.includes(requirement.property) === true
  );`,
  `  return record.manifest.ownershipClaims.some(
    (claim) =>
      claim.domain === requirement.domain &&
      (claim.properties === undefined ||
        claim.properties.length === 0 ||
        claim.properties.includes(requirement.property))
  );`
);
replaceExact(
  "packages/core/src/router/route-capabilities-security.ts",
  `  assertProjectSnapshotDigest(input.project);
  const project = guardDependencies(
    effectiveBrowserTargets(input.project),
    input.request,
    input.catalog
  );
  return routeCapabilitiesWorkspaceReuse({
    ...input,
    project,
    catalog: new SecurityCatalogView(input.catalog, input.request)
  });`,
  `  assertProjectSnapshotDigest(input.project);
  const catalog = freezeCatalog(input.catalog);
  const project = guardDependencies(
    effectiveBrowserTargets(input.project),
    input.request,
    catalog
  );
  return routeCapabilitiesWorkspaceReuse({
    ...input,
    project,
    catalog: new SecurityCatalogView(catalog, input.request)
  });`
);
