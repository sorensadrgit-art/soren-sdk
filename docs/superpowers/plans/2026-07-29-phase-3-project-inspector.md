# Phase 3 Project Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Implement task-by-task with failing tests first.

**Goal:** Build a static, read-only project inspector that produces deterministic, contract-valid `ProjectSnapshot` records and exposes `soren-sdk inspect [path] [--json]`.

**Architecture:** Extend `@soren-sdk/core` with an inspector module. The CLI remains a thin adapter. The inspector reads project metadata and selected configuration bytes only; it never executes package managers, Git, scripts, or network requests.

**Tech Stack:** Node.js 24 built-ins, TypeScript 6, Vitest 4, `@soren-sdk/contracts`.

## Global constraints

- No subprocess or shell execution.
- No network access.
- No project writes.
- No symlink traversal.
- Ignore `.git`, `node_modules`, `.next`, `dist`, `build`, `coverage`, `.turbo`, `.cache`, `.vite`, and `.svelte-kit` during recursive package discovery.
- Snapshot collections are sorted by stable code-point ordering.
- Snapshot ID excludes `snapshotId`, `createdAt`, and absolute `root`.
- File digests are SHA-256 over raw bytes.
- Git dirty state is conservative: Git projects report `dirty: true` plus a warning because static inspection cannot prove cleanliness.

---

## Task 1 — Inspector domain and filesystem primitives

**Create:**

- `packages/core/src/inspector/types.ts`
- `packages/core/src/inspector/filesystem.ts`
- `packages/core/test/inspector-filesystem.test.ts`

**Interfaces:**

```ts
export interface InspectProjectOptions {
  root: string;
  createdAt?: string;
}

export class ProjectInspectionError extends Error {
  constructor(
    readonly code:
      | "PROJECT_ROOT_INVALID"
      | "PACKAGE_MANIFEST_INVALID"
      | "PROJECT_SNAPSHOT_INVALID",
    message: string,
    readonly path?: string
  );
}
```

Filesystem helpers must normalize relative paths to POSIX form, reject path escape, read JSON with stable errors, hash raw bytes, and recursively find `package.json` files without following symlinks.

Tests:

- Reject missing root package manifest.
- Reject malformed root package manifest.
- Ignore package manifests beneath ignored directories.
- Do not follow a symlink to an external package.
- Return stable root-relative paths.

---

## Task 2 — Package manager and workspace detection

**Create:**

- `packages/core/src/inspector/package-manager.ts`
- `packages/core/src/inspector/workspaces.ts`
- `packages/core/test/package-manager.test.ts`
- `packages/core/test/workspaces.test.ts`

Package-manager precedence:

1. Parse root `packageManager` field when valid.
2. Match it to known lockfiles.
3. Otherwise select the only detected lockfile.
4. If multiple lockfiles exist, select the manager field when it matches; otherwise return `unknown` and warn.

Supported lockfiles:

- `pnpm-lock.yaml`
- `package-lock.json`
- `npm-shrinkwrap.json`
- `yarn.lock`
- `bun.lock`
- `bun.lockb`

Workspace patterns:

- `pnpm-workspace.yaml` `packages:` list
- `package.json` `workspaces: []`
- `package.json` `workspaces.packages: []`

Expand patterns against discovered package directories. Support `*`, `**`, and leading `./`. Include the root package. Sort by path. Warn on duplicate package names.

---

## Task 3 — Project detectors

**Create:**

- `packages/core/src/inspector/git.ts`
- `packages/core/src/inspector/detect.ts`
- `packages/core/test/git.test.ts`
- `packages/core/test/detect.test.ts`

Git detection:

- Resolve `.git` directories and `gitdir:` files.
- Read `HEAD`.
- Resolve loose refs, packed refs, or detached HEAD.
- Never execute Git.
- Git projects report `dirty: true` and a warning.

Framework dependency map:

```text
react → react
next → nextjs
vite → vite
@remix-run/react → remix
astro → astro
vue → vue
nuxt → nuxt
svelte → svelte
@sveltejs/kit → sveltekit
@angular/core → angular
```

Collect all dependency groups from every workspace. Detect runtimes from `engines.node`, `engines.bun`, `engines.deno`, and `packageManager` when relevant.

Configuration kinds include:

- TypeScript
- Next.js
- Vite
- Astro
- Svelte
- Nuxt
- Storybook main/preview
- shadcn `components.json`
- Playwright
- Vitest
- Jest
- Tailwind
- ESLint
- Soren config

Policies include `.soren-sdk/policy.yaml`, `.soren-sdk/policy.yml`, and `.soren-sdk/policy.json`.

Targets:

- `browserslist` string/array/object from package manifests
- `.browserslistrc` non-comment lines
- runtime targets from engines

---

## Task 4 — Deterministic ProjectSnapshot builder

**Create:**

- `packages/core/src/inspector/inspect-project.ts`
- `packages/core/test/inspect-project.test.ts`
- Modify `packages/core/src/index.ts`

Algorithm:

1. Resolve real root and root package manifest.
2. Detect package manager and lockfile digest.
3. Discover workspace packages.
4. Collect revision, runtimes, frameworks, dependencies, configurations, policies, targets, and warnings.
5. Build digest payload excluding `root`, `createdAt`, and `snapshotId`.
6. Create `snapshotId` with `digestJson`.
7. Validate through `validateContract<ProjectSnapshot>("project-snapshot", snapshot)`.

Required fixtures:

- Single-package npm/Next.js
- pnpm monorepo
- Yarn workspace
- Storybook/shadcn workspace
- Animation-heavy workspace
- Multiple lockfiles
- Invalid package manifest
- Git direct ref
- Git packed ref
- Git worktree pointer
- Non-Git project

Determinism tests:

- Same content at two roots produces same ID.
- Different `createdAt` produces same ID.
- Package, lockfile, config, policy, target, or revision change changes ID.
- Snapshot validates against the contract.

---

## Task 5 — CLI inspect command

**Modify:**

- `packages/cli/src/run.ts`
- `packages/cli/src/format.ts`
- `packages/cli/test/cli.test.ts`
- `packages/cli/README.md`
- `README.md`

Command:

```text
soren-sdk inspect [path] [--json]
```

Behavior:

- Default path is `.`.
- Resolve relative path from CLI `cwd`.
- Human output summarizes snapshot ID, package manager, package count, frameworks, dependency count, configuration/policy counts, browser/runtime targets, and warnings.
- JSON output uses canonical JSON.
- Exit `0` success, `2` invalid args, `1` inspection error.
- No writes.

---

## Task 6 — CI, smoke test, review, and merge

**Modify:**

- `.github/workflows/contracts-ci.yml`
- `docs/ROADMAP.md`
- Issue #1 roadmap tracker

Add smoke commands:

```bash
node packages/cli/dist/bin.js inspect --json
node packages/cli/dist/bin.js inspect .
```

Final checks:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:repository
pnpm smoke:cli
node packages/cli/dist/bin.js inspect --json
```

Independent review focuses on:

- False-negative package/workspace detection
- Glob behavior
- Symlink and path escape
- Deterministic hashing
- Git metadata limitations
- Secret-content exposure
- CLI exit codes and write behavior
- Absence of `child_process`, shell, HTTP, fetch, or mutation APIs
