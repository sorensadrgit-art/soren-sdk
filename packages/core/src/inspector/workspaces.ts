import { basename, join } from "node:path";

import {
  findPackageDirectories,
  isRegularFile,
  projectRelativePath,
  readPackageManifest,
  readText
} from "./filesystem.js";
import type {
  PackageManifest,
  WorkspaceDetection,
  WorkspacePackageRecord
} from "./types.js";

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function packageJsonWorkspacePatterns(manifest: PackageManifest): string[] {
  if (Array.isArray(manifest.workspaces)) return stringArray(manifest.workspaces);
  if (
    typeof manifest.workspaces === "object" &&
    manifest.workspaces !== null &&
    "packages" in manifest.workspaces
  ) {
    return stringArray((manifest.workspaces as { packages?: unknown }).packages);
  }
  return [];
}

function parseYamlScalar(value: string): string {
  const trimmed = value.trim();
  const withoutComment = trimmed.replace(/\s+#.*$/, "").trim();
  if (
    (withoutComment.startsWith('"') && withoutComment.endsWith('"')) ||
    (withoutComment.startsWith("'") && withoutComment.endsWith("'"))
  ) {
    return withoutComment.slice(1, -1);
  }
  return withoutComment;
}

export function parsePnpmWorkspacePatterns(source: string): string[] {
  const lines = source.split(/\r?\n/);
  const patterns: string[] = [];
  let inPackages = false;
  let baseIndent = 0;
  for (const line of lines) {
    if (!inPackages) {
      const match = /^(\s*)packages\s*:\s*$/.exec(line);
      if (match !== null) {
        inPackages = true;
        baseIndent = match[1]?.length ?? 0;
      }
      continue;
    }
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (indent <= baseIndent && !line.trimStart().startsWith("-")) break;
    const item = /^\s*-\s*(.+)$/.exec(line);
    if (item !== null) {
      const value = parseYamlScalar(item[1] ?? "");
      if (value !== "") patterns.push(value);
    }
  }
  return patterns;
}

function normalizePattern(pattern: string): string {
  return pattern.trim().replace(/^\.\//, "").replace(/\/$/, "");
}

function globToRegExp(pattern: string): RegExp {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index] as string;
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        index += 1;
        if (pattern[index + 1] === "/") {
          index += 1;
          expression += "(?:.*/)?";
        } else {
          expression += ".*";
        }
      } else {
        expression += "[^/]*";
      }
    } else if (char === "?") {
      expression += "[^/]";
    } else {
      expression += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`${expression}$`);
}

function matches(path: string, pattern: string): boolean {
  return globToRegExp(normalizePattern(pattern)).test(path);
}

function packageName(
  manifest: PackageManifest,
  path: string,
  warnings: string[]
): string {
  if (typeof manifest.name === "string" && manifest.name.trim() !== "") {
    return manifest.name;
  }
  const fallback = path === "." ? "(root)" : `workspace:${path}`;
  warnings.push(`Package at ${path} has no valid name; using ${fallback}.`);
  return fallback;
}

export function detectWorkspaces(
  root: string,
  rootManifest: PackageManifest
): WorkspaceDetection {
  const warnings: string[] = [];
  const pnpmWorkspacePath = join(root, "pnpm-workspace.yaml");
  const pnpmPatterns = isRegularFile(pnpmWorkspacePath)
    ? parsePnpmWorkspacePatterns(readText(pnpmWorkspacePath))
    : [];
  const packagePatterns = packageJsonWorkspacePatterns(rootManifest);
  const patterns = pnpmPatterns.length > 0 ? pnpmPatterns : packagePatterns;
  const includes = patterns.filter((pattern) => !pattern.startsWith("!"));
  const excludes = patterns
    .filter((pattern) => pattern.startsWith("!"))
    .map((pattern) => pattern.slice(1));

  const directories = findPackageDirectories(root);
  const selected = directories.filter((directory) => {
    const path = projectRelativePath(root, directory);
    if (path === ".") return true;
    if (includes.length === 0) return false;
    return (
      includes.some((pattern) => matches(path, pattern)) &&
      !excludes.some((pattern) => matches(path, pattern))
    );
  });

  const packages: WorkspacePackageRecord[] = selected.map((directory) => {
    const path = projectRelativePath(root, directory);
    const manifestPath = join(directory, "package.json");
    const manifest = path === "." ? rootManifest : readPackageManifest(manifestPath);
    return {
      name: packageName(manifest, path, warnings),
      path,
      private: manifest.private === true,
      manifestPath,
      manifest
    };
  });

  packages.sort((left, right) => left.path.localeCompare(right.path));
  const names = new Map<string, string>();
  for (const item of packages) {
    const previous = names.get(item.name);
    if (previous !== undefined) {
      warnings.push(
        `Duplicate package name ${item.name} appears at ${previous} and ${item.path}.`
      );
    } else {
      names.set(item.name, item.path);
    }
  }

  if (pnpmPatterns.length > 0 && packagePatterns.length > 0) {
    warnings.push(
      "Both pnpm-workspace.yaml and package.json workspaces are present; pnpm-workspace.yaml takes precedence."
    );
  }

  return {
    isMonorepo: patterns.length > 0 || packages.length > 1,
    packages,
    warnings: [...new Set(warnings)].sort()
  };
}

export function workspaceDisplayName(path: string): string {
  return path === "." ? basename(process.cwd()) : path;
}
