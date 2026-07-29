import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { detectRevision } from "../src/inspector/git.js";

async function root(): Promise<{ path: string; cleanup(): Promise<void> }> {
  const path = await mkdtemp(join(tmpdir(), "soren-sdk-git-"));
  return {
    path,
    async cleanup() {
      await rm(path, { recursive: true, force: true });
    }
  };
}

describe("static git revision detection", () => {
  it("resolves loose refs without executing git", async () => {
    const project = await root();
    try {
      await mkdir(join(project.path, ".git", "refs", "heads"), { recursive: true });
      await writeFile(join(project.path, ".git", "HEAD"), "ref: refs/heads/main\n");
      await writeFile(
        join(project.path, ".git", "refs", "heads", "main"),
        "1111111111111111111111111111111111111111\n"
      );
      const result = detectRevision(project.path);
      expect(result.revision).toEqual({
        vcs: "git",
        commit: "1111111111111111111111111111111111111111",
        dirty: true
      });
      expect(result.warnings[0]).toContain("conservatively true");
    } finally {
      await project.cleanup();
    }
  });

  it("resolves packed refs", async () => {
    const project = await root();
    try {
      await mkdir(join(project.path, ".git"), { recursive: true });
      await writeFile(join(project.path, ".git", "HEAD"), "ref: refs/heads/main\n");
      await writeFile(
        join(project.path, ".git", "packed-refs"),
        "2222222222222222222222222222222222222222 refs/heads/main\n"
      );
      expect(detectRevision(project.path).revision.commit).toBe(
        "2222222222222222222222222222222222222222"
      );
    } finally {
      await project.cleanup();
    }
  });

  it("resolves worktree gitdir pointers and common refs", async () => {
    const project = await root();
    const metadata = await root();
    try {
      const worktree = join(metadata.path, "worktrees", "demo");
      await mkdir(worktree, { recursive: true });
      await mkdir(join(metadata.path, "refs", "heads"), { recursive: true });
      await writeFile(join(project.path, ".git"), `gitdir: ${worktree}\n`);
      await writeFile(join(worktree, "HEAD"), "ref: refs/heads/main\n");
      await writeFile(join(worktree, "commondir"), "../..\n");
      await writeFile(
        join(metadata.path, "refs", "heads", "main"),
        "3333333333333333333333333333333333333333\n"
      );
      expect(detectRevision(project.path).revision.commit).toBe(
        "3333333333333333333333333333333333333333"
      );
    } finally {
      await project.cleanup();
      await metadata.cleanup();
    }
  });

  it("reports non-git projects without warnings", async () => {
    const project = await root();
    try {
      expect(detectRevision(project.path)).toEqual({
        revision: { vcs: "none", commit: null, dirty: false },
        warnings: []
      });
    } finally {
      await project.cleanup();
    }
  });
});
