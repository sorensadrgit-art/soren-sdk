import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { isRegularFile, readText } from "./filesystem.js";
import type { RevisionDetection } from "./types.js";

interface GitMarkerNone {
  kind: "none";
}

interface GitMarkerDirectory {
  kind: "directory";
  directory: string;
}

interface GitMarkerInvalid {
  kind: "invalid";
  message: string;
}

type GitMarker = GitMarkerNone | GitMarkerDirectory | GitMarkerInvalid;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function gitDirectory(root: string): GitMarker {
  const marker = join(root, ".git");
  let info;
  try {
    info = lstatSync(marker);
  } catch (error) {
    return isMissing(error)
      ? { kind: "none" }
      : { kind: "invalid", message: errorMessage(error) };
  }

  if (info.isDirectory()) {
    return { kind: "directory", directory: marker };
  }
  if (!info.isFile()) {
    return {
      kind: "invalid",
      message: ".git marker is neither a directory nor a regular gitdir file."
    };
  }

  try {
    const source = readFileSync(marker, "utf8").trim();
    const match = /^gitdir:\s*(.+)$/i.exec(source);
    if (match === null) {
      return { kind: "invalid", message: ".git file has no valid gitdir entry." };
    }
    const value = match[1] as string;
    return {
      kind: "directory",
      directory: isAbsolute(value) ? value : resolve(root, value)
    };
  } catch (error) {
    return { kind: "invalid", message: errorMessage(error) };
  }
}

function commonDirectory(gitDir: string): string {
  const marker = join(gitDir, "commondir");
  if (!isRegularFile(marker)) return gitDir;
  const value = readText(marker).trim();
  return isAbsolute(value) ? value : resolve(gitDir, value);
}

function packedRef(directory: string, ref: string): string | null {
  const path = join(directory, "packed-refs");
  if (!isRegularFile(path)) return null;
  for (const line of readText(path).split(/\r?\n/)) {
    if (line === "" || line.startsWith("#") || line.startsWith("^")) continue;
    const [commit, name] = line.split(" ");
    if (name === ref && commit !== undefined) return commit;
  }
  return null;
}

function resolveRef(gitDir: string, ref: string): string | null {
  const common = commonDirectory(gitDir);
  for (const directory of [gitDir, common]) {
    const path = join(directory, ref);
    if (isRegularFile(path)) return readText(path).trim() || null;
    const packed = packedRef(directory, ref);
    if (packed !== null) return packed;
  }
  return null;
}

export function detectRevision(root: string): RevisionDetection {
  const marker = gitDirectory(root);
  if (marker.kind === "none") {
    return {
      revision: { vcs: "none", commit: null, dirty: false },
      warnings: []
    };
  }
  if (marker.kind === "invalid") {
    return {
      revision: { vcs: "unknown", commit: null, dirty: true },
      warnings: [`Git metadata marker is invalid: ${marker.message}`]
    };
  }

  const warnings = [
    "Git dirty state is conservatively true because the static inspector does not execute git status."
  ];
  try {
    const headPath = join(marker.directory, "HEAD");
    const head = readText(headPath).trim();
    const ref = /^ref:\s*(.+)$/.exec(head);
    const commit =
      ref === null ? head || null : resolveRef(marker.directory, ref[1] as string);
    if (commit === null) warnings.push("Git HEAD could not be resolved to a commit.");
    return {
      revision: { vcs: "git", commit, dirty: true },
      warnings
    };
  } catch (error) {
    warnings.push(`Git metadata could not be read: ${errorMessage(error)}`);
    return {
      revision: { vcs: "unknown", commit: null, dirty: true },
      warnings
    };
  }
}
