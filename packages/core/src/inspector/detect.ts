import { basename } from "node:path";

import type { ProjectSnapshot } from "@soren-sdk/contracts";

import {
  digestFile,
  findProjectFiles,
  isRegularFile,
  projectRelativePath,
  readText
} from "./filesystem.js";
import type { WorkspacePackageRecord } from "./types.js";

const DEPENDENCY_GROUPS = [
  ["dependencies", "dependency"],
  ["devDependencies", "devDependency"],
  ["peerDependencies", "peerDependency"],
  ["optionalDependencies", "optionalDependency"]
] as const;

const FRAMEWORKS = new Map([
  ["react", "react"],
  ["next", "nextjs"],
  ["vite", "vite"],
  ["@remix-run/react", "remix"],
  ["astro", "astro"],
  ["vue", "vue"],
  ["nuxt", "nuxt"],
  ["svelte", "svelte"],
  ["@sveltejs/kit", "sveltekit"],
  ["@angular/core", "angular"]
]);

function objectEntries(value: unknown): Array<[string, string]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  );
}

export function collectDependencies(
  packages: readonly WorkspacePackageRecord[]
): ProjectSnapshot["dependencies"] {
  const result: ProjectSnapshot["dependencies"] = [];
  for (const workspace of packages) {
    for (const [field, kind] of DEPENDENCY_GROUPS) {
      for (const [name, version] of objectEntries(workspace.manifest[field])) {
        result.push({ name, version, kind, workspace: workspace.path });
      }
    }
  }
  return result.sort((left, right) =>
    [left.workspace, left.name, left.kind].join("\0").localeCompare(
      [right.workspace, right.name, right.kind].join("\0")
    )
  );
}

export function detectFrameworks(
  dependencies: ProjectSnapshot["dependencies"]
): ProjectSnapshot["frameworks"] {
  const priority = new Map([
    ["dependency", 0],
    ["peerDependency", 1],
    ["devDependency", 2],
    ["optionalDependency", 3]
  ]);
  const records = new Map<
    string,
    ProjectSnapshot["frameworks"][number] & { priority: number }
  >();
  for (const dependency of dependencies) {
    const framework = FRAMEWORKS.get(dependency.name);
    if (framework === undefined) continue;
    const key = `${dependency.workspace}\0${framework}`;
    const candidate = {
      name: framework,
      version: dependency.version,
      workspace: dependency.workspace,
      priority: priority.get(dependency.kind) ?? 9
    };
    const current = records.get(key);
    if (current === undefined || candidate.priority < current.priority) {
      records.set(key, candidate);
    }
  }
  return [...records.values()]
    .map((record) => ({
      name: record.name,
      version: record.version,
      workspace: record.workspace
    }))
    .sort((left, right) =>
      [left.workspace, left.name].join("\0").localeCompare(
        [right.workspace, right.name].join("\0")
      )
    );
}

export function detectRuntimes(
  packages: readonly WorkspacePackageRecord[]
): ProjectSnapshot["runtimes"] {
  const values = new Map<string, { name: string; version: string | null }>();
  for (const workspace of packages) {
    const engines = objectEntries(workspace.manifest.engines);
    for (const [name, version] of engines) {
      if (!["node", "bun", "deno"].includes(name)) continue;
      values.set(`${name}\0${version}`, { name, version });
    }
  }
  return [...values.values()].sort((left, right) =>
    [left.name, left.version ?? ""].join("\0").localeCompare(
      [right.name, right.version ?? ""].join("\0")
    )
  );
}

function configurationKind(projectPath: string): string | null {
  const name = basename(projectPath);
  if (/^tsconfig(?:\..+)?\.json$/.test(name)) return "typescript";
  if (/^next\.config\./.test(name)) return "nextjs";
  if (/^vite\.config\./.test(name)) return "vite";
  if (/^astro\.config\./.test(name)) return "astro";
  if (/^svelte\.config\./.test(name)) return "svelte";
  if (/^nuxt\.config\./.test(name)) return "nuxt";
  if (name === "pnpm-workspace.yaml") return "workspace-pnpm";
  if (projectPath.includes("/.storybook/") || projectPath.startsWith(".storybook/")) {
    if (/^main\./.test(name)) return "storybook-main";
    if (/^preview\./.test(name)) return "storybook-preview";
  }
  if (name === "components.json") return "shadcn";
  if (/^playwright\.config\./.test(name)) return "playwright";
  if (/^vitest\.config\./.test(name)) return "vitest";
  if (/^jest\.config\./.test(name)) return "jest";
  if (/^tailwind\.config\./.test(name)) return "tailwind";
  if (/^eslint\.config\./.test(name) || /^\.eslintrc/.test(name)) return "eslint";
  if (/^\.soren-sdk\/config\.(?:ya?ml|json)$/.test(projectPath)) return "soren-config";
  return null;
}

export function detectConfigurations(
  root: string,
  packages: readonly WorkspacePackageRecord[]
): ProjectSnapshot["configurations"] {
  const configurations: ProjectSnapshot["configurations"] = findProjectFiles(root)
    .map((path) => {
      const projectPath = projectRelativePath(root, path);
      const kind = configurationKind(projectPath);
      return kind === null
        ? null
        : { kind, path: projectPath, digest: digestFile(path) };
    })
    .filter(
      (value): value is ProjectSnapshot["configurations"][number] => value !== null
    );

  for (const workspace of packages) {
    if (!isRegularFile(workspace.manifestPath)) continue;
    configurations.push({
      kind: "package-manifest",
      path: projectRelativePath(root, workspace.manifestPath),
      digest: digestFile(workspace.manifestPath)
    });
  }

  return configurations.sort((left, right) =>
    [left.path, left.kind].join("\0").localeCompare(
      [right.path, right.kind].join("\0")
    )
  );
}

export function detectPolicies(root: string): ProjectSnapshot["policies"] {
  return findProjectFiles(root)
    .map((path) => {
      const projectPath = projectRelativePath(root, path);
      return /^\.soren-sdk\/policy\.(?:ya?ml|json)$/.test(projectPath)
        ? { path: projectPath, digest: digestFile(path) }
        : null;
    })
    .filter((value): value is ProjectSnapshot["policies"][number] => value !== null)
    .sort((left, right) => left.path.localeCompare(right.path));
}

function addBrowserslist(
  value: unknown,
  output: Set<string>,
  prefix?: string
): void {
  if (typeof value === "string") {
    output.add(prefix === undefined ? value : `${prefix}:${value}`);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) addBrowserslist(item, output, prefix);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [environment, queries] of Object.entries(value)) {
      addBrowserslist(queries, output, environment);
    }
  }
}

export function detectTargets(
  root: string,
  packages: readonly WorkspacePackageRecord[],
  runtimes: ProjectSnapshot["runtimes"]
): ProjectSnapshot["targets"] {
  const browsers = new Set<string>();
  for (const workspace of packages) {
    addBrowserslist(workspace.manifest.browserslist, browsers);
  }
  for (const path of findProjectFiles(root)) {
    if (basename(path) !== ".browserslistrc") continue;
    for (const line of readText(path).split(/\r?\n/)) {
      const value = line.trim();
      if (value !== "" && !value.startsWith("#")) browsers.add(value);
    }
  }
  return {
    browsers: [...browsers].sort(),
    runtimes: runtimes
      .map((runtime) => `${runtime.name}@${runtime.version ?? "unknown"}`)
      .sort()
  };
}
