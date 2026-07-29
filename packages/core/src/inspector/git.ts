import { lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { isRegularFile, readText } from "./filesystem.js";
import type { RevisionDetection } from "./types.js";

function gitDirectory(root: string): string | null {
  const marker = join(root, ".git");
  try {
    const info = lstatSync(marker);
    if (info.isDirectory()) return marker;
    if (!info.isFile()) return null;
    const source = readFileSync(marker, "utf8").trim();
    const match = /^gitdir:\s*(.+)$/i.exec(source);
    if (match === null) return null;
    const value = match[1] as string;
    return isAbsolute(value) ? value : resolve(root, value);
  } catch {
    return null;
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
  const gitDir = gitDirectory(root);
  if (gitDir === null) {
    return {
      revision: { vcs: "none", commit: null, dirty: false },
      warnings: []
    };
  }

  const warnings = [
    "Git dirty state is conservatively true because the static inspector does not execute git status."
  ];
  try {
    const headPath = join(gitDir, "HEAD");
    const head = readText(headPath).trim();
    const ref = /^ref:\s*(.+)$/.exec(head);
    const commit = ref === null ? head || null : resolveRef(gitDir, ref[1] as string);
    if (commit === null) warnings.push("Git HEAD could not be resolved to a commit.");
    return {
      revision: { vcs: "git", commit, dirty: true },
      warnings
    };
  } catch (error) {
    warnings.push(
      `Git metadata could not be read: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
    return {
      revision: { vcs: "unknown", commit: null, dirty: true },
      warnings
    };
  }
}
