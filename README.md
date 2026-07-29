# Soren SDK

> Agent-native SDK intelligence, project inspection, cataloging, policy, routing, tool brokering, execution planning, and verification for premium frontend development.

**Repository:** `sorensadrgit-art/soren-sdk`  
**Status:** Phase 3 read-only intelligence foundation complete  
**Runtime:** Node.js 24, pnpm 11.17.0, TypeScript 6  
**Primary owner:** Soren

## What Soren SDK is

Soren SDK is the intelligence and governance layer between a user request and the frontend SDKs used to implement that request.

It is not an animation library, a package installer, or one giant prompt containing every SDK. It gives coding agents structured contracts, current connector knowledge, deterministic project context, policy boundaries, compatibility rules, verification requirements, and evidence.

```text
User request
    ↓
Project snapshot
    ↓
Capability resolution
    ↓
Native and SDK candidates
    ↓
Policy and ownership checks
    ↓
Smallest safe provider set
    ↓
Selective context and tools
    ↓
Reviewable plan
    ↓
Verification and evidence
```

Only the first three layers are executable today. Routing, external tool access, and project mutation remain disabled.

## Completed executable phases

### Phase 1 — Versioned contracts

`@soren-sdk/contracts` provides:

- JSON Schema Draft 2020-12 contracts
- Connector Manifest v2 structural and semantic validation
- Project, catalog, policy, route, execution, evidence, error, and lockfile contracts
- Canonical JSON serialization
- Deterministic SHA-256 digests
- Typed errors
- Explicit migration scaffolding
- Repository-wide contract validation

### Phase 2 — Connector catalog and local snapshots

`@soren-sdk/core`, `@soren-sdk/connectors`, and `@soren-sdk/cli` provide:

- Deterministic connector discovery
- Lazy manifest loading
- Legacy connector isolation
- Connector health and freshness diagnostics
- Content-addressed catalog snapshots
- In-memory and SQLite snapshot storage
- SQLite integrity verification
- Read-only catalog CLI commands

### Phase 3 — Static project inspector

The project inspector provides:

- npm, pnpm, Yarn, and Bun detection
- Lockfile hashing
- npm/Yarn/Bun and pnpm workspace discovery
- Stable workspace package inventory
- Runtime, framework, and dependency detection
- Storybook, shadcn, framework, testing, TypeScript, lint, and Soren configuration detection
- Policy and browser-target detection
- Static Git revision parsing
- Symlink-safe recursive discovery
- Deterministic, contract-valid `ProjectSnapshot` records

The inspector never executes Git or a package manager. Git projects are conservatively marked dirty because static inspection cannot prove worktree cleanliness.

## Quick start

```bash
pnpm install --frozen-lockfile
pnpm build
```

### Inspect a frontend project

```bash
node packages/cli/dist/bin.js inspect ../my-project
node packages/cli/dist/bin.js inspect ../my-project --json
```

Inspect this repository:

```bash
node packages/cli/dist/bin.js inspect --json
```

### Explore the SDK catalog

```bash
node packages/cli/dist/bin.js catalog list
node packages/cli/dist/bin.js catalog list --json
node packages/cli/dist/bin.js catalog get web-platform --json
node packages/cli/dist/bin.js connector health web-platform --json
```

### Create a catalog snapshot

Without persistence:

```bash
node packages/cli/dist/bin.js catalog snapshot --json
```

With explicit local SQLite persistence:

```bash
node packages/cli/dist/bin.js \
  catalog snapshot \
  --database .soren-sdk/catalog.sqlite \
  --json
```

## Write boundary

These commands are read-only:

- `inspect`
- `catalog list`
- `catalog get`
- `connector health`
- `catalog snapshot` without `--database`

Only `catalog snapshot --database <path>` creates or updates a file, and it writes only to the explicitly requested SQLite database.

There is currently no package installation, shell execution, project-source mutation, remote MCP invocation, or network access.

## ProjectSnapshot behavior

A project snapshot contains:

- Revision metadata
- Package manager and lockfile digest
- Workspace graph
- Runtimes and frameworks
- Dependency inventory
- Configuration and policy file digests
- Browser and runtime targets
- Warnings
- Content-addressed snapshot ID

The snapshot ID excludes the absolute root and creation time, so identical clones produce the same ID. It changes when meaningful project state changes.

Raw configuration and policy file contents are not copied into the snapshot. Only paths and SHA-256 digests are retained.

## Connector status

- `web-platform` is the first Connector Schema v2 record.
- Motion, GSAP, Lenis, React Three Fiber, Storybook, and shadcn remain legacy planning manifests.
- Legacy records are visible but never selectable.
- Health is diagnostic and does not authorize routing.
- Connector documents are parsed as untrusted data and never executed by the catalog.

Standards:

- [`docs/SDK-CONNECTOR-STANDARD.md`](./docs/SDK-CONNECTOR-STANDARD.md)
- [`schemas/connector.schema.json`](./schemas/connector.schema.json)
- [`capabilities/catalog.json`](./capabilities/catalog.json)

## Package structure

```text
packages/
├── contracts/      # schemas, validation, canonical JSON, digests
├── core/           # catalog service and static project inspector
├── connectors/     # connector loading, health, snapshots, storage
├── cli/            # read-only CLI
├── protocol-server/ # planned
└── testing/         # planned
```

Applications such as the Control Center remain planned clients of the core. They will never become the system of record.

## Next milestone

Phase 4 is the first capability router vertical slice:

1. Web Platform
2. Motion
3. GSAP

It must determine when CSS or Web Animations API is sufficient, when Motion or GSAP is appropriate, when they may coexist, when user input is required, and when policy blocks a route.

Hard gates include zero forbidden selections, zero ownership conflicts, native-first behavior, and positive, negative, and metamorphic route fixtures.

## Security position

- Retrieved documentation and tool metadata are untrusted input.
- Connector files are data, not executable instructions.
- Project inspection is static and read-only.
- Symlinks are not followed during project discovery.
- Git commit values are accepted only when they match valid hash formats.
- Runtime dependencies belong only in target workspaces.
- No credentials, agents, or model IDs are hardcoded in core contracts.
- Protected branches change through reviewed pull requests.
- Completion claims require runner-generated evidence.

Read:

- [`SECURITY.md`](./SECURITY.md)
- [`docs/THREAT-MODEL.md`](./docs/THREAT-MODEL.md)
- [`docs/GOVERNANCE-SECURITY.md`](./docs/GOVERNANCE-SECURITY.md)
- [`docs/LICENSE-POLICY.md`](./docs/LICENSE-POLICY.md)
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- [`docs/PLATFORM-CONTRACTS-V2.md`](./docs/PLATFORM-CONTRACTS-V2.md)

## Verification

Permanent CI uses a frozen lockfile, pinned GitHub Actions, Node.js 24, and read-only repository permissions.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm validate:repository
pnpm smoke:cli
```

## Roadmap

Completed:

- Architecture Hardening v2
- Phase 1 contracts
- Phase 2 catalog and SQLite snapshots
- Phase 3 project inspector

Next:

- Phase 4 Web Platform + Motion + GSAP routing
- Policy, configuration, and lockfile enforcement
- Universal CLI/REST/MCP/TypeScript surfaces
- Context broker and read-only tool gateway
- Plan, verification, and evidence services
- Approved apply sandbox after release `0.1`
- Remaining first-wave connectors
- Soren Design System integration
- Control Center

See [`docs/ROADMAP.md`](./docs/ROADMAP.md).
