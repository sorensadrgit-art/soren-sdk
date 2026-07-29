import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { sha256Bytes, type Digest } from "@soren-sdk/contracts";

import {
  ProjectInspectionError,
  type PackageManifest
} from "./types.js";

const IGNORED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".next",
  ".output",
  ".parcel-cache",
  ".svelte-kit",
  ".turbo",
  ".vercel",
  ".vite",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out"
]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown filesystem error.";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveProjectRoot(input: string): string {
  const candidate = resolve(input);
  let root: string;
  try {
    root = realpathSync(candidate);
  } catch (error) {
    throw new ProjectInspectionError(
      "PROJECT_ROOT_INVALID",
      `Unable to resolve project root: ${errorMessage(error)}`,
      candidate
    );
  }

  if (!statSync(root).isDirectory()) {
    throw new ProjectInspectionError(
      "PROJECT_ROOT_INVALID",
      "Project root is not a directory.",
      root
    );
  }

  const manifest = join(root, "package.json");
  try {
    const info = lstatSync(manifest);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error("Root package.json must be a regular file.");
    }
  } catch (error) {
    throw new ProjectInspectionError(
      "PROJECT_ROOT_INVALID",
      `Project root requires a readable package.json: ${errorMessage(error)}`,
      manifest
    );
  }
  return root;
}

export function readPackageManifest(path: string): PackageManifest {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new ProjectInspectionError(
      "PACKAGE_MANIFEST_INVALID",
      `Unable to parse package manifest: ${errorMessage(error)}`,
      path
    );
  }
  if (!isObject(value)) {
    throw new ProjectInspectionError(
      "PACKAGE_MANIFEST_INVALID",
      "Package manifest must be a JSON object.",
      path
    );
  }
  return value;
}

export function readText(path: string): string {
  return readFileSync(path, "utf8");
}

export function digestFile(path: string): Digest {
  return sha256Bytes(readFileSync(path));
}

export function projectRelativePath(root: string, absolutePath: string): string {
  const result = relative(root, absolutePath);
  if (result === "") return ".";
  if (result === ".." || result.startsWith(`..${sep}`) || isAbsolute(result)) {
    throw new ProjectInspectionError(
      "PROJECT_ROOT_INVALID",
      "Detected path escapes the project root.",
      absolutePath
    );
  }
  return result.split(sep).join("/");
}

export function resolveInsideProject(root: string, projectPath: string): string {
  const candidate = resolve(root, projectPath);
  projectRelativePath(root, candidate);
  return candidate;
}

export function isRegularFile(path: string): boolean {
  try {
    const info = lstatSync(path);
    return info.isFile() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

function walkDirectories(current: string, packages: string[]): void {
  const manifest = join(current, "package.json");
  if (isRegularFile(manifest)) packages.push(current);

  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;
    walkDirectories(join(current, entry.name), packages);
  }
}

export function findPackageDirectories(root: string): string[] {
  const packages: string[] = [];
  walkDirectories(root, packages);
  return packages.sort((left, right) =>
    projectRelativePath(root, left).localeCompare(projectRelativePath(root, right))
  );
}

function walkFiles(current: string, files: string[]): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      walkFiles(path, files);
      continue;
    }
    if (entry.isFile()) files.push(path);
  }
}

export function findProjectFiles(root: string): string[] {
  const files: string[] = [];
  walkFiles(root, files);
  return files.sort((left, right) =>
    projectRelativePath(root, left).localeCompare(projectRelativePath(root, right))
  );
}

export function directoryOf(path: string): string {
  return dirname(path);
}
