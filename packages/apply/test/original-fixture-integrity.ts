import { createHash } from "node:crypto";
import { lstat, readdir, readFile, readlink, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export type FixtureEntry = Readonly<{
  path: string;
  type: "directory" | "file" | "symlink" | "other";
  bytes?: Uint8Array;
  linkTarget?: string;
  mode?: number;
}>;

export type FixtureTree = ReadonlyMap<string, FixtureEntry>;

function portableMode(mode: number): number {
  return mode & 0o777;
}

export async function recordOriginalFixtureTree(root: string): Promise<FixtureTree> {
  const entries = new Map<string, FixtureEntry>();
  async function visit(path: string): Promise<void> {
    const info = await lstat(path);
    const key = relative(root, path) || ".";
    if (info.isSymbolicLink()) {
      entries.set(key, { path: key, type: "symlink", linkTarget: await readlink(path), mode: portableMode(info.mode) });
      return;
    }
    if (info.isDirectory()) {
      entries.set(key, { path: key, type: "directory", mode: portableMode(info.mode) });
      for (const child of (await readdir(path)).sort()) await visit(join(path, child));
      return;
    }
    if (info.isFile()) {
      entries.set(key, { path: key, type: "file", bytes: await readFile(path), mode: portableMode(info.mode) });
      return;
    }
    entries.set(key, { path: key, type: "other", mode: portableMode(info.mode) });
  }
  await visit(root);
  return entries;
}

function fingerprint(entry: FixtureEntry): string {
  const body = entry.bytes === undefined ? "" : createHash("sha256").update(entry.bytes).digest("hex");
  return `${entry.type}:${entry.mode ?? ""}:${entry.linkTarget ?? ""}:${body}`;
}

export async function assertOriginalFixtureUnchanged(root: string, before: FixtureTree): Promise<void> {
  const after = await recordOriginalFixtureTree(root);
  const beforeKeys = [...before.keys()].sort();
  const afterKeys = [...after.keys()].sort();
  if (beforeKeys.join("\0") !== afterKeys.join("\0")) throw new Error("Original fixture tree changed.");
  for (const path of beforeKeys) {
    const expected = before.get(path);
    const actual = after.get(path);
    if (expected === undefined || actual === undefined || fingerprint(expected) !== fingerprint(actual)) {
      throw new Error(`Original fixture changed: ${path}.`);
    }
  }
}

export async function assertProtectedWorkspaceUnchanged(root: string, run: () => Promise<unknown>): Promise<void> {
  const before = await recordOriginalFixtureTree(root);
  try { await run(); } finally { await assertOriginalFixtureUnchanged(root, before); }
}
