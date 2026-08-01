# @soren-sdk/core

Provider-neutral application services for Soren SDK.

The current package exposes two stable service areas:

- Connector catalog service interfaces
- Static read-only project inspection
- Context selection returns immutable, provenance-bound untrusted-data envelopes with `instructionAuthority: "none"`

## Public project-inspector API

```ts
import {
  inspectProject,
  ProjectInspectionError,
  type InspectProjectOptions
} from "@soren-sdk/core";

const snapshot = inspectProject({
  root: "/path/to/project",
  createdAt: new Date().toISOString()
});
```

`inspectProject()` returns a contract-valid `ProjectSnapshot` from `@soren-sdk/contracts`.

## What the inspector reads

- Root and workspace `package.json` files
- Supported package-manager lockfiles
- `pnpm-workspace.yaml` or `package.json` workspace declarations
- Selected framework, TypeScript, Storybook, shadcn, testing, lint, and Soren configuration files
- Soren policy files
- `.browserslistrc` and `browserslist` package metadata
- Static `.git` metadata needed to resolve the current commit

Configuration and policy contents are represented by SHA-256 digests. Their raw contents are not copied into the snapshot.

## What the inspector records

- Git revision metadata
- Package manager, declared version, lockfile path, and lockfile digest
- Stable workspace package list
- Runtime and framework versions
- Dependency inventory across all workspace package manifests
- Configuration and policy file paths and digests
- Browser and runtime targets
- Deterministic warnings
- A content-addressed snapshot ID

## Determinism

The snapshot ID excludes:

- Absolute project root
- Snapshot creation time
- The snapshot ID field itself

It includes all other normalized project-state fields. Identical clones inspected at different paths and times produce the same ID.

Meaningful changes to package manifests, lockfiles, workspace declarations, configurations, policies, targets, or Git revision change the ID.

## Static Git limitation

The inspector does not execute `git status`. It can resolve Git HEAD from directories, worktree pointers, loose refs, and packed refs, but it cannot prove that the worktree is clean.

For Git projects it therefore records:

```json
{
  "dirty": true
}
```

and emits an explicit warning. Only valid 40- or 64-character hexadecimal commit hashes are accepted. Arbitrary HEAD content and unsafe ref paths are rejected.

## Filesystem and security boundaries

The inspector:

- Resolves the project root with `realpath`
- Requires a regular root `package.json`
- Does not follow symlinks during discovery
- Ignores dependency, cache, coverage, and build-output directories
- Uses normalized root-relative POSIX paths inside snapshot collections
- Does not execute subprocesses or shell commands
- Does not access the network
- Does not install dependencies
- Does not write to the inspected project

Internal filesystem, Git, and glob helpers are not part of the public package API.

## Errors

```ts
try {
  inspectProject({ root: "./project" });
} catch (error) {
  if (error instanceof ProjectInspectionError) {
    console.error(error.code, error.message);
  }
}
```

Stable error codes:

- `PROJECT_ROOT_INVALID`
- `PACKAGE_MANIFEST_INVALID`
- `PROJECT_SNAPSHOT_INVALID`
