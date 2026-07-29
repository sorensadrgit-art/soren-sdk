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

const COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const REF_PATTERN = /^refs\/[A-Za-z0-9._/-]+$/;

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function normalizedCommit(value: string): string | null {
  const commit = value.trim();
  return COMMIT_PATTERN.test(commit) ? commit.toLowerCase() : null;
}

function safeRef(value: string): string | null {
  const ref = value.trim();
  if (!REF_PATTERN.test(ref)) return null;
  if (ref.split("/").some((segment) => segment === ".." || segment === "")) {
    return null;
  }
  return ref;
}

function gitDirectory(root: string): GitMarker {
  const marker = join(root, ".git");
  let info;
  try {
    info = lstatSync(marker);
  } catch (error) {
    return isMissing(error)
      ? { kind: "none" }
      : { kind: "invalid", message: "Unable to inspect .git marker." };
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
  } catch {
    return { kind: "invalid", message: "Unable to read .git marker." };
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
    if (name === ref && commit !== undefined) return normalizedCommit(commit);
  }
  return null;
}

function resolveRef(gitDir: string, refValue: string): string | null {
  const ref = safeRef(refValue);
  if (ref === null) return null;
  const common = commonDirectory(gitDir);
  for (const directory of [gitDir, common]) {
    const path = join(directory, ref);
    if (isRegularFile(path)) return normalizedCommit(readText(path));
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
    const refMatch = /^ref:\s*(.+)$/.exec(head);
    const commit =
      refMatch === null
        ? normalizedCommit(head)
        : resolveRef(marker.directory, refMatch[1] as string);
    if (commit === null) {
      warnings.push("Git HEAD could not be resolved to a valid commit hash.");
    }
    return {
      revision: { vcs: "git", commit, dirty: true },
      warnings
    };
  } catch {
    warnings.push("Git metadata could not be read.");
    return {
      revision: { vcs: "unknown", commit: null, dirty: true },
      warnings
    };
  }
}
