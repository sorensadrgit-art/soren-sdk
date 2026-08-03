import * as fsp from "node:fs/promises";
import * as path from "node:path";

import { digestJson } from "@soren-sdk/contracts";

import { fileDigest, pathInsideRoot } from "./path-safety.js";
import type { SandboxEntry, SandboxSnapshot } from "./types.js";

interface WalkContext {
  root: string;
  entries: SandboxEntry[];
}

/**
 * Walk a directory tree deterministically. Entries are sorted by path so
 * snapshots are reproducible. Symlinks and special files are recorded with
 * placeholder digests so a snapshot accurately reflects their presence.
 */
export async function buildSnapshot(root: string): Promise<SandboxSnapshot> {
  const context: WalkContext = { root, entries: [] };
  await walk(root, root, context, 0);

  const entries = context.entries.sort((left, right) =>
    left.path.localeCompare(right.path)
  );

  const digest = digestJson({
    root,
    entries: entries.map((entry) => ({
      path: entry.path,
      type: entry.type,
      size: entry.size,
      digest: entry.digest
    }))
  });

  return { root, entries, digest };
}

async function walk(
  directory: string,
  root: string,
  context: WalkContext,
  depth: number
): Promise<void> {
  if (depth > 128) {
    throw new Error(`Directory nesting exceeds 128 at ${directory}`);
  }

  let entries: string[] = [];
  try {
    entries = await fsp.readdir(directory);
  } catch {
    return;
  }
  entries.sort((left, right) => left.localeCompare(right));

  for (const name of entries) {
    const absolute = path.join(directory, name);
    const relative = path.relative(root, absolute);
    if (!pathInsideRoot(absolute, root)) continue;

    let stat: Awaited<ReturnType<typeof fsp.stat>>;
    try {
      stat = await fsp.stat(absolute);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      context.entries.push({
        path: relative,
        type: "directory",
        size: 0,
        digest: null
      });
      await walk(absolute, root, context, depth + 1);
    } else if (stat.isFile()) {
      let content: Uint8Array;
      try {
        content = await fsp.readFile(absolute);
      } catch {
        continue;
      }
      context.entries.push({
        path: relative,
        type: "file",
        size: stat.size,
        digest: fileDigest(content)
      });
    } else if (stat.isSymbolicLink()) {
      context.entries.push({
        path: relative,
        type: "symlink",
        size: 0,
        digest: null
      });
    } else {
      context.entries.push({
        path: relative,
        type: "unknown",
        size: stat.size,
        digest: null
      });
    }
  }
}

/**
 * Compute a deterministic diff between two snapshots. Entries are compared
 * by path; ordering of the output is deterministic.
 */
export function snapshotDiff(
  before: SandboxSnapshot,
  after: SandboxSnapshot
): Array<{
  path: string;
  kind: "created" | "modified" | "removed";
  beforeDigest: string | null;
  afterDigest: string | null;
}> {
  const beforeByPath = new Map(before.entries.map((entry) => [entry.path, entry]));
  const afterByPath = new Map(after.entries.map((entry) => [entry.path, entry]));
  const allPaths = new Set([...beforeByPath.keys(), ...afterByPath.keys()]);

  const diff: Array<{
    path: string;
    kind: "created" | "modified" | "removed";
    beforeDigest: string | null;
    afterDigest: string | null;
  }> = [];

  for (const p of allPaths) {
    const beforeEntry = beforeByPath.get(p);
    const afterEntry = afterByPath.get(p);
    if (beforeEntry === undefined) {
      diff.push({
        path: p,
        kind: "created",
        beforeDigest: null,
        afterDigest: afterEntry?.digest ?? null
      });
    } else if (afterEntry === undefined) {
      diff.push({
        path: p,
        kind: "removed",
        beforeDigest: beforeEntry.digest ?? null,
        afterDigest: null
      });
    } else if (
      beforeEntry.type !== afterEntry.type ||
      beforeEntry.digest !== afterEntry.digest
    ) {
      diff.push({
        path: p,
        kind: "modified",
        beforeDigest: beforeEntry.digest ?? null,
        afterDigest: afterEntry.digest ?? null
      });
    }
  }

  return diff.sort((left, right) => left.path.localeCompare(right.path));
}