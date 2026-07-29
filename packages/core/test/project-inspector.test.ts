import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ProjectInspectionError,
  inspectProject
} from "../src/index.js";
import { parsePnpmWorkspacePatterns } from "../src/inspector/workspaces.js";

async function fixture(files: Record<string, string>): Promise<{
  root: string;
  cleanup(): Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "soren-sdk-inspector-"));
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
  return {
    root,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    }
  };
}

function packageJson(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

describe("project inspector", () => {
  it("detects an npm Next.js project and validates the snapshot", async () => {
    const project = await fixture({
      "package.json": packageJson({
        name: "web",
        private: true,
        engines: { node: ">=24" },
        browserslist: ["> 0.5%", "not dead"],
        dependencies: { next: "16.0.0", react: "19.2.0" },
        packageManager: "npm@11.18.0"
      }),
      "package-lock.json": "{\"lockfileVersion\":3}",
      "next.config.ts": "export default {};",
      "tsconfig.json": "{}"
    });
    try {
      const snapshot = inspectProject({
        root: project.root,
        createdAt: "2026-07-29T00:00:00.000Z"
      });
      expect(snapshot.packageManager.name).toBe("npm");
      expect(snapshot.packageManager.lockfile).toBe("package-lock.json");
      expect(snapshot.packageManager.lockfileDigest).toMatch(
        /^sha256:[0-9a-f]{64}$/
      );
      expect(snapshot.frameworks.map((item) => item.name)).toEqual([
        "nextjs",
        "react"
      ]);
      expect(snapshot.targets.browsers).toEqual(["> 0.5%", "not dead"]);
      expect(snapshot.configurations.map((item) => item.kind)).toEqual([
        "nextjs",
        "package-manifest",
        "typescript"
      ]);
      expect(snapshot.snapshotId).toMatch(/^sha256:[0-9a-f]{64}$/);
    } finally {
      await project.cleanup();
    }
  });

  it("detects a pnpm monorepo and animation-heavy dependencies", async () => {
    const project = await fixture({
      "package.json": packageJson({
        name: "root",
        private: true,
        packageManager: "pnpm@11.17.0"
      }),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n  - 'packages/**'\n",
      "apps/web/package.json": packageJson({
        name: "web",
        private: true,
        dependencies: {
          react: "19.2.0",
          motion: "12.0.0",
          gsap: "3.13.0",
          lenis: "1.3.0",
          "@react-three/fiber": "9.0.0"
        },
        devDependencies: { vitest: "4.1.10", "@storybook/react": "10.0.0" }
      }),
      "packages/ui/package.json": packageJson({
        name: "@demo/ui",
        private: false,
        peerDependencies: { react: "^19" }
      }),
      "apps/web/.storybook/main.ts": "export default {};",
      "apps/web/components.json": "{}"
    });
    try {
      const snapshot = inspectProject({ root: project.root });
      expect(snapshot.workspace.isMonorepo).toBe(true);
      expect(snapshot.workspace.packages.map((item) => item.path)).toEqual([
        ".",
        "apps/web",
        "packages/ui"
      ]);
      expect(snapshot.dependencies.some((item) => item.name === "gsap")).toBe(true);
      expect(snapshot.configurations.some((item) => item.kind === "storybook-main")).toBe(
        true
      );
      expect(snapshot.configurations.some((item) => item.kind === "shadcn")).toBe(
        true
      );
      expect(
        snapshot.configurations.filter((item) => item.kind === "package-manifest")
      ).toHaveLength(3);
      expect(snapshot.configurations.some((item) => item.kind === "workspace-pnpm")).toBe(
        true
      );
    } finally {
      await project.cleanup();
    }
  });

  it("supports package.json workspaces and policy/target files", async () => {
    const project = await fixture({
      "package.json": packageJson({
        name: "yarn-root",
        private: true,
        packageManager: "yarn@4.9.2",
        workspaces: ["packages/*"]
      }),
      "yarn.lock": "__metadata:\n  version: 8\n",
      "packages/ui/package.json": packageJson({
        name: "ui",
        dependencies: { react: "19" }
      }),
      ".soren-sdk/policy.yaml": "schemaVersion: 1.0.0-draft.1\n",
      ".browserslistrc": "last 2 Chrome versions\n# comment\nnot dead\n"
    });
    try {
      const snapshot = inspectProject({ root: project.root });
      expect(snapshot.packageManager.name).toBe("yarn");
      expect(snapshot.workspace.packages.map((item) => item.path)).toEqual([
        ".",
        "packages/ui"
      ]);
      expect(snapshot.policies).toHaveLength(1);
      expect(snapshot.targets.browsers).toEqual([
        "last 2 Chrome versions",
        "not dead"
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("produces the same ID across clone paths and creation times", async () => {
    const files = {
      "package.json": packageJson({ name: "same", dependencies: { react: "19" } }),
      "package-lock.json": "same-lock"
    };
    const first = await fixture(files);
    const second = await fixture(files);
    try {
      const left = inspectProject({
        root: first.root,
        createdAt: "2026-07-28T00:00:00.000Z"
      });
      const right = inspectProject({
        root: second.root,
        createdAt: "2026-07-29T00:00:00.000Z"
      });
      expect(left.snapshotId).toBe(right.snapshotId);
    } finally {
      await first.cleanup();
      await second.cleanup();
    }
  });

  it("changes the ID for package, lockfile, config, policy, target, and revision changes", async () => {
    const project = await fixture({
      "package.json": packageJson({ name: "change" }),
      "package-lock.json": "lock-a",
      "tsconfig.json": "{}",
      ".soren-sdk/policy.yaml": "rule: a\n",
      ".browserslistrc": "last 1 Chrome version\n"
    });
    try {
      let previous = inspectProject({ root: project.root }).snapshotId;

      await writeFile(join(project.root, "package-lock.json"), "lock-b");
      let current = inspectProject({ root: project.root }).snapshotId;
      expect(current).not.toBe(previous);
      previous = current;

      await writeFile(
        join(project.root, "package.json"),
        packageJson({ name: "change", scripts: { build: "example" } })
      );
      current = inspectProject({ root: project.root }).snapshotId;
      expect(current).not.toBe(previous);
      previous = current;

      await writeFile(join(project.root, "tsconfig.json"), '{"strict":true}');
      current = inspectProject({ root: project.root }).snapshotId;
      expect(current).not.toBe(previous);
      previous = current;

      await writeFile(join(project.root, ".soren-sdk/policy.yaml"), "rule: b\n");
      current = inspectProject({ root: project.root }).snapshotId;
      expect(current).not.toBe(previous);
      previous = current;

      await writeFile(
        join(project.root, ".browserslistrc"),
        "last 2 Chrome versions\n"
      );
      current = inspectProject({ root: project.root }).snapshotId;
      expect(current).not.toBe(previous);
      previous = current;

      await mkdir(join(project.root, ".git", "refs", "heads"), { recursive: true });
      await writeFile(join(project.root, ".git", "HEAD"), "ref: refs/heads/main\n");
      await writeFile(
        join(project.root, ".git", "refs", "heads", "main"),
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n"
      );
      current = inspectProject({ root: project.root }).snapshotId;
      expect(current).not.toBe(previous);
      previous = current;

      await writeFile(
        join(project.root, ".git", "refs", "heads", "main"),
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n"
      );
      current = inspectProject({ root: project.root }).snapshotId;
      expect(current).not.toBe(previous);
    } finally {
      await project.cleanup();
    }
  });

  it("warns and returns unknown for ambiguous lockfiles", async () => {
    const project = await fixture({
      "package.json": packageJson({ name: "ambiguous" }),
      "package-lock.json": "{}",
      "yarn.lock": ""
    });
    try {
      const snapshot = inspectProject({ root: project.root });
      expect(snapshot.packageManager.name).toBe("unknown");
      expect(snapshot.warnings.some((item) => item.includes("ambiguous"))).toBe(
        true
      );
    } finally {
      await project.cleanup();
    }
  });

  it("does not traverse package symlinks", async () => {
    const project = await fixture({
      "package.json": packageJson({ name: "root", workspaces: ["packages/*"] })
    });
    const external = await fixture({
      "package.json": packageJson({ name: "outside" })
    });
    try {
      await mkdir(join(project.root, "packages"), { recursive: true });
      await symlink(external.root, join(project.root, "packages", "outside"), "dir");
      const snapshot = inspectProject({ root: project.root });
      expect(snapshot.workspace.packages.map((item) => item.name)).toEqual([
        "root"
      ]);
    } finally {
      await project.cleanup();
      await external.cleanup();
    }
  });

  it("rejects malformed root package manifests", async () => {
    const project = await fixture({ "package.json": "{" });
    try {
      expect(() => inspectProject({ root: project.root })).toThrow(
        ProjectInspectionError
      );
    } finally {
      await project.cleanup();
    }
  });

  it("parses block and inline pnpm workspace package patterns", () => {
    expect(
      parsePnpmWorkspacePatterns(
        "packages:\n  - 'apps/*'\n  - packages/**\n  - '!packages/old'\n"
      )
    ).toEqual(["apps/*", "packages/**", "!packages/old"]);
    expect(
      parsePnpmWorkspacePatterns("packages: ['apps/*', \"packages/**\"]\n")
    ).toEqual(["apps/*", "packages/**"]);
  });
});
