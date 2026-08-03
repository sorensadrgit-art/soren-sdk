# @soren-sdk/core

Provider-neutral application services for Soren SDK.

The package exposes three service areas:

- Connector catalog interfaces
- Static read-only project inspection
- Deterministic native-first capability routing

## Project inspector

```ts
import { inspectProject } from "@soren-sdk/core";

const snapshot = inspectProject({
  root: "/path/to/project",
  createdAt: new Date().toISOString()
});
```

`inspectProject()` returns a contract-valid `ProjectSnapshot`. It reads package/workspace metadata, supported lockfiles, selected configuration and policy files, browser/runtime targets, and static Git metadata.

The inspector:

- Resolves the root with `realpath`
- Requires a regular root `package.json`
- Does not follow symlinks during discovery
- Ignores dependency, cache, coverage, and build-output directories
- Stores normalized root-relative paths in snapshot collections
- Stores configuration and policy digests instead of raw contents
- Does not execute Git, package managers, subprocesses, or network requests
- Does not write to the inspected project

Git projects are conservatively marked dirty because static inspection cannot prove worktree cleanliness.

## Native-first router

```ts
import {
  inspectProject,
  routeCapabilities,
  type RouteInput
} from "@soren-sdk/core";

const project = inspectProject({ root: "/path/to/project" });
const plan = routeCapabilities({
  request,
  project,
  catalog
} satisfies RouteInput);
```

The Phase 4 router considers only:

- `web-platform`
- `motion`
- `gsap`

It consumes structured `RouteRequest`, `ProjectSnapshot`, catalog state, and an optional tightening-only policy override. It does not interpret prose.

### Decision order

1. Validate contracts and snapshot references.
2. Build candidates only from healthy approved selectable Connector Manifest v2 records.
3. Apply policy, artifact, license, paid-service, environment, forbidden-provider, and provider-limit constraints.
4. Prefer native Web Platform coverage where sufficient.
5. Prefer the smallest sufficient third-party provider set.
6. Reuse an installed approved dependency when otherwise equivalent.
7. Apply preferred-provider order, support level, and confidence.
8. Detect ownership conflicts and ambiguity.
9. Produce a deterministic contract-valid `RoutePlan`.

### Route outcomes

- `native`
- `selected`
- `no-sdk`
- `needs-input`
- `blocked`

A blocked or needs-input plan is a valid routing result, not an exception.

### Phase 4 policy

The built-in policy:

- Allows only Web Platform, Motion, and GSAP
- Denies experimental connectors
- Allows reviewed licenses only
- Denies paid services
- Denies network access, project writes, commands, and remote project content
- Requires reduced-motion support

Caller policies may tighten these limits but may not weaken them.

### Environment rule

Motion's React-specific claims require a safely provable React declaration of `18.2` or newer. Unparseable or insufficient declarations block required Motion React claims instead of being guessed compatible.

### Ownership

Capabilities receive deterministic default scope/property ownership. Explicit same-scope, same-property exclusive ownership by different providers returns `blocked`. Potential overlap with missing material ownership details returns `needs-input`.

### Determinism

The Route Plan decision digest excludes `createdAt`, `planId`, `digest`, and `requestId`. It includes normalized capability quality, request preferences, project/catalog/policy snapshot IDs, outcome, providers, ownership, constraints, uncertainty, and required input.

Capability order, catalog enumeration order, creation time, and clone path do not change an equivalent decision digest.

## Stable errors

Project inspection errors include:

- `PROJECT_ROOT_INVALID`
- `PACKAGE_MANIFEST_INVALID`
- `PROJECT_SNAPSHOT_INVALID`

Router input errors include:

- `POLICY_INVALID`
- `POLICY_WEAKENING_DENIED`
- `ROUTE_INPUT_INVALID`
- `ROUTE_PLAN_INVALID`

## Security boundary

Core routing contains no package installation, subprocess, shell, network, MCP, Agent Skill, credential, code-generation, or project-write capability. Connector documents are consumed through validated catalog interfaces as untrusted data.
