import { readFileSync, writeFileSync } from "node:fs";

function replaceExact(path, before, after) {
  const source = readFileSync(path, "utf8");
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${path}: expected exactly one audited source fragment, found ${occurrences}.`);
  }
  writeFileSync(path, source.replace(before, after), "utf8");
}

replaceExact(
  "packages/contracts/src/cli/validate-repository.ts",
  `function parseYamlNumber(value: string): number | undefined {
  const normalized = value.replaceAll("_", "");
  const sign = normalized.startsWith("-") ? -1 : 1;
  const unsigned = normalized.replace(/^[+-]/, "");

  if (/^\\.inf$/i.test(unsigned)) return sign * Number.POSITIVE_INFINITY;
  if (/^\\.nan$/i.test(unsigned)) return Number.NaN;
  if (/^0x[0-9a-f]+$/i.test(unsigned)) {
    return sign * Number.parseInt(unsigned.slice(2), 16);
  }
  if (/^0o[0-7]+$/i.test(unsigned)) {
    return sign * Number.parseInt(unsigned.slice(2), 8);
  }
  if (/^0b[01]+$/i.test(unsigned)) {
    return sign * Number.parseInt(unsigned.slice(2), 2);
  }
  if (
    /^[+-]?(?:(?:0|[1-9]\\d*)(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?$/i.test(
      normalized
    )
  ) {
    return Number(normalized);
  }
  return undefined;
}`,
  `function parseYamlNumber(value: string): number | undefined {
  const sign = value.startsWith("-") ? -1 : 1;
  const unsigned = value.replace(/^[+-]/, "");

  if (/^\\.inf$/i.test(unsigned)) return sign * Number.POSITIVE_INFINITY;
  if (/^\\.nan$/i.test(unsigned)) return Number.NaN;

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

  const decimal = /^[+-]?(?:(?:\\d(?:_?\\d)*)(?:\\.(?:\\d(?:_?\\d)*)?)?|\\.\\d(?:_?\\d)*)(?:e[+-]?\\d(?:_?\\d)*)?$/i;
  return decimal.test(value) ? Number(value.replaceAll("_", "")) : undefined;
}`
);

replaceExact(
  "packages/core/src/router/route-capabilities-workspace-reuse.ts",
  `function normalizeRange(value: string): string {
  let result = value.trim();
  if (result.startsWith("workspace:")) {
    result = result.slice("workspace:".length).trim();
  }
  if (result.startsWith("npm:")) {
    const separator = result.lastIndexOf("@");
    result = separator > "npm:".length ? result.slice(separator + 1) : result;
  }
  return result;
}`,
  `interface DependencySpec {
  range: string;
  aliasTarget: string | null;
}

function dependencySpec(value: string): DependencySpec {
  let result = value.trim();
  if (result.startsWith("workspace:")) {
    result = result.slice("workspace:".length).trim();
  }
  if (!result.startsWith("npm:")) {
    return { range: result, aliasTarget: null };
  }
  const alias = result.slice("npm:".length);
  const separator = alias.lastIndexOf("@");
  if (separator <= 0) return { range: "", aliasTarget: alias };
  return {
    aliasTarget: alias.slice(0, separator),
    range: alias.slice(separator + 1)
  };
}

function normalizeRange(value: string): string {
  return dependencySpec(value).range;
}`
);

replaceExact(
  "packages/core/src/router/route-capabilities-workspace-reuse.ts",
  `  const tokens = clause.replaceAll(",", " ").split(/\\s+/).filter(Boolean);`,
  `  const normalizedComparators = clause.replace(
    /(>=|<=|>|<|=)\\s+(?=v?\\d)/g,
    "$1"
  );
  const tokens = normalizedComparators
    .replaceAll(",", " ")
    .split(/\\s+/)
    .filter(Boolean);`
);

replaceExact(
  "packages/core/src/router/route-capabilities-workspace-reuse.ts",
  `  return project.dependencies.some(
    (dependency) =>
      dependency.name === packageName &&
      (dependency.workspace ?? ".") === workspace &&
      versions.some((version) =>
        versionSatisfiesRange(version, dependency.version)
      )
  );`,
  `  return project.dependencies.some((dependency) => {
    if (
      dependency.name !== packageName ||
      (dependency.workspace ?? ".") !== workspace
    ) {
      return false;
    }
    const spec = dependencySpec(dependency.version);
    if (spec.aliasTarget !== null && spec.aliasTarget !== packageName) {
      return false;
    }
    return versions.some((version) =>
      versionSatisfiesRange(version, spec.range)
    );
  });`
);

replaceExact(
  "packages/core/src/router/route-capabilities-workspace-reuse.ts",
  `    return localDependencies.some((dependency) =>
      versions.some((version) =>
        versionSatisfiesRange(version, dependency.version)
      )
    );`,
  `    return localDependencies.some((dependency) => {
      const spec = dependencySpec(dependency.version);
      if (spec.aliasTarget !== null && spec.aliasTarget !== packageName) {
        return false;
      }
      return versions.some((version) =>
        versionSatisfiesRange(version, spec.range)
      );
    });`
);

replaceExact(
  "packages/core/src/router/route-capabilities-security.ts",
  `function selectedWorkspace(request: RouteRequest): string | null {
  const workspaces = new Set<string>();
  for (const capability of request.capabilities) {
    if (!capability.required) continue;
    const workspace = capability.quality?.workspace;
    if (typeof workspace === "string" && workspace.trim() !== "") {
      workspaces.add(workspace.trim());
    }
  }
  return workspaces.size === 1 ? [...workspaces][0] ?? null : null;
}

function guardDependencies(
  project: ProjectSnapshot,
  request: RouteRequest
): ProjectSnapshot {
  let dependencies = project.dependencies.map((dependency) => ({
    ...dependency,
    version: normalizeDependencyRange(dependency.version)
  }));
  const workspace = selectedWorkspace(request);
  if (workspace !== null && workspace !== ".") {
    const localNames = new Set(
      dependencies
        .filter((dependency) => dependency.workspace === workspace)
        .map((dependency) => dependency.name)
    );
    dependencies = dependencies.filter(
      (dependency) =>
        (dependency.workspace ?? ".") !== "." || !localNames.has(dependency.name)
    );
  }
  const frameworks = project.frameworks.map((framework) => ({`,
  `function runtimePackageShadowTargets(
  request: RouteRequest,
  catalog: CatalogReader
): Map<string, string> {
  const targets = new Map<string, Set<string>>();
  const unscoped = new Set<string>();

  for (const record of catalog.list()) {
    if (record.kind !== "schema-v2") continue;
    const claims = new Set(
      record.manifest.capabilityClaims.map((claim) => claim.capability)
    );
    const relevant = request.capabilities.filter(
      (capability) => capability.required && claims.has(capability.id)
    );
    if (relevant.length === 0) continue;

    const explicit = new Set<string>();
    let hasUnscoped = false;
    for (const capability of relevant) {
      const workspace = capability.quality?.workspace;
      if (typeof workspace !== "string" || workspace.trim() === "") {
        hasUnscoped = true;
      } else {
        explicit.add(workspace.trim());
      }
    }

    for (const integration of record.manifest.integrations) {
      if (
        integration.kind !== "runtime-package" ||
        integration.mode !== "runtime" ||
        integration.packageName === undefined
      ) {
        continue;
      }
      if (hasUnscoped) {
        unscoped.add(integration.packageName);
        continue;
      }
      const packageTargets =
        targets.get(integration.packageName) ?? new Set<string>();
      for (const workspace of explicit) packageTargets.add(workspace);
      targets.set(integration.packageName, packageTargets);
    }
  }

  const result = new Map<string, string>();
  for (const [packageName, workspaces] of targets) {
    if (unscoped.has(packageName) || workspaces.size !== 1) continue;
    const workspace = [...workspaces][0];
    if (workspace !== undefined && workspace !== ".") {
      result.set(packageName, workspace);
    }
  }
  return result;
}

function guardDependencies(
  project: ProjectSnapshot,
  request: RouteRequest,
  catalog: CatalogReader
): ProjectSnapshot {
  let dependencies = project.dependencies.map((dependency) => ({
    ...dependency,
    version: normalizeDependencyRange(dependency.version)
  }));
  const shadowTargets = runtimePackageShadowTargets(request, catalog);
  const shadowedRootPackages = new Set(
    [...shadowTargets].flatMap(([packageName, workspace]) =>
      dependencies.some(
        (dependency) =>
          dependency.name === packageName &&
          (dependency.workspace ?? ".") === workspace
      )
        ? [packageName]
        : []
    )
  );
  dependencies = dependencies.filter(
    (dependency) =>
      (dependency.workspace ?? ".") !== "." ||
      !shadowedRootPackages.has(dependency.name)
  );
  const frameworks = project.frameworks.map((framework) => ({`
);

replaceExact(
  "packages/core/src/router/route-capabilities-security.ts",
  `  const project = guardDependencies(
    effectiveBrowserTargets(input.project),
    input.request
  );`,
  `  const project = guardDependencies(
    effectiveBrowserTargets(input.project),
    input.request,
    input.catalog
  );`
);

console.log("Applied project-wide audit fixes.");
