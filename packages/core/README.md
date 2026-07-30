# @soren-sdk/core

Provider-neutral application services for Soren SDK.

The package exposes three stable service areas:

- Connector catalog service interfaces
- Static read-only project inspection
- Deterministic native-first capability routing

## Public router API

```ts
import type { RouteRequest } from "@soren-sdk/contracts";
import {
  inspectProject,
  routeCapabilities
} from "@soren-sdk/core";
import { FileSystemConnectorCatalog } from "@soren-sdk/connectors";

const createdAt = new Date().toISOString();
const project = inspectProject({
  root: "/path/to/project",
  createdAt
});
const catalog = new FileSystemConnectorCatalog({
  root: "/path/to/soren-sdk"
});

const request: RouteRequest = {
  schemaVersion: "1.0.0-draft.1",
  contractKind: "route-request",
  requestId: "request_example",
  createdAt,
  projectSnapshotId: project.snapshotId,
  summary: "Explicit GSAP timeline route",
  capabilities: [
    {
      id: "motion.timeline",
      required: true,
      quality: {
        scope: "hero",
        property: "transform"
      }
    }
  ],
  preferences: {
    preferredProviders: ["gsap"],
    forbiddenProviders: [],
    maxProviders: 1,
    allowPaidServices: false,
    allowExperimental: false
  }
};

const plan = routeCapabilities({
  request,
  project,
  catalog,
  createdAt
});
```

The router accepts only explicit capability IDs. It does not infer intent from natural language.

Phase 4 may select only:

- `web-platform`
- `motion`
- `gsap`

Possible plan statuses are `native`, `selected`, `no-sdk`, `needs-input`, and `blocked`.

### Routing order

1. Validate all input contracts and the final Route Plan.
2. Apply hard constraints before scoring.
3. Prefer complete Web Platform coverage.
4. Minimize the third-party provider set.
5. Reuse approved installed dependencies.
6. Apply explicit preferred-provider order.
7. Compare support and confidence.
8. Require input for materially different tied architectures.
9. Block exclusive same-scope/same-property ownership conflicts.
10. Produce a content-addressed plan ID and digest.

The route identity excludes creation time, project absolute root, capability ordering, and catalog enumeration ordering.

Full details: [`../../docs/PHASE-4-NATIVE-FIRST-ROUTER.md`](../../docs/PHASE-4-NATIVE-FIRST-ROUTER.md).

## Public project-inspector API

```ts
import {
  inspectProject,
  ProjectInspectionError
} from "@soren-sdk/core";

const snapshot = inspectProject({
  root: "/path/to/project",
  createdAt: new Date().toISOString()
});
```

`inspectProject()` returns a contract-valid `ProjectSnapshot`.

## What the inspector reads

- Root and workspace `package.json` files
- Supported package-manager lockfiles
- `pnpm-workspace.yaml` or `package.json` workspace declarations
- Selected framework, TypeScript, Storybook, shadcn, testing, lint, and Soren configuration files
- Soren policy files
- Browser target metadata
- Static `.git` metadata needed to resolve the current commit

Configuration and policy contents are represented by SHA-256 digests. Their raw contents are not copied into the snapshot.

## Determinism

The project snapshot ID excludes the absolute project root, snapshot creation time, and the snapshot ID field itself. Identical clones inspected at different paths and times produce the same ID.

## Static Git limitation

The inspector does not execute `git status`. It resolves Git HEAD from directories, worktree pointers, loose refs, and packed refs, but cannot prove that a worktree is clean. It records `dirty: true` with an explicit warning.

## Security boundaries

The inspector and router:

- Resolve project roots with `realpath`
- Do not follow symlinks during project discovery
- Do not execute subprocesses or shell commands
- Do not access the network
- Do not install dependencies
- Do not invoke tools, skills, or MCP servers
- Do not write to the inspected project

Internal filesystem, Git, glob, candidate-ranking, and ownership helpers are not part of the public package API.

## Inspector errors

Stable error codes:

- `PROJECT_ROOT_INVALID`
- `PACKAGE_MANIFEST_INVALID`
- `PROJECT_SNAPSHOT_INVALID`
