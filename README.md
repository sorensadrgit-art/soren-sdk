# Soren SDK

> Agent-native SDK intelligence, project inspection, cataloging, policy, routing, tool brokering, execution planning, and verification for premium frontend development.

**Repository:** `sorensadrgit-art/soren-sdk`  
**Status:** Phase 4 native-first capability routing complete  
**Runtime:** Node.js 24, pnpm 11.17.0, TypeScript 6  
**Primary owner:** Soren

## What Soren SDK is

Soren SDK is the intelligence and governance layer between a user request and the frontend SDKs used to implement that request.

It is not an animation library, a package installer, or one giant prompt containing every SDK. It gives coding agents structured contracts, current connector knowledge, deterministic project context, policy boundaries, compatibility rules, verification requirements, and evidence.

```text
Explicit capability request
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
Contract-valid RoutePlan
```

Contracts, cataloging, project inspection, and the first deterministic routing vertical slice are executable today. External tool access, package installation, code generation, and project mutation remain disabled.

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

### Phase 4 — Native-first capability router

The router provides:

- Explicit `RouteRequest` input and contract-valid `RoutePlan` output
- Native-first Web Platform routing
- Approved Motion and GSAP routing
- Required and optional capability handling
- Provider allowlists, forbids, preference order, and provider limits
- Motion React 18.2+ compatibility enforcement
- Reduced-motion verification enforcement
- Existing approved dependency reuse
- Minimal sufficient provider-set selection
- Material-tie detection with `needs-input`
- Explicit scope/property ownership planning
- Exclusive same-scope/same-property conflict blocking
- Stable reason codes, constraints, route digests, and plan IDs
- Determinism across creation time, clone path, request order, and catalog order
- 34 golden positive, negative, composition, and metamorphic route cases

The router reads local project and connector data only. It never installs packages, invokes tools or MCP servers, executes commands, accesses the network, generates code, or writes to the project.

Read [`docs/PHASE-4-NATIVE-FIRST-ROUTER.md`](./docs/PHASE-4-NATIVE-FIRST-ROUTER.md).

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

### Route explicit capabilities

Native CSS route:

```bash
node packages/cli/dist/bin.js route \
  --project ../my-project \
  --capability platform.css-transition
```

GSAP timeline route:

```bash
node packages/cli/dist/bin.js route \
  --project ../my-project \
  --capability motion.timeline \
  --preferred gsap \
  --max-providers 1 \
  --scope hero \
  --property transform \
  --json
```

Motion and GSAP composition:

```bash
node packages/cli/dist/bin.js route \
  --project ../my-project \
  --capability motion.layout \
  --capability motion.timeline \
  --max-providers 2 \
  --json
```

The CLI accepts explicit capability IDs only. It does not infer capabilities from prose.

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
- `route`
- `catalog list`
- `catalog get`
- `connector health`
- `catalog snapshot` without `--database`

Only `catalog snapshot --database <path>` creates or updates a file, and it writes only to the explicitly requested SQLite database.

There is currently no package installation, shell execution, project-source mutation, remote MCP invocation, code generation, or network access.

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

## Router behavior

Phase 4 may select only:

- `web-platform`
- `motion`
- `gsap`

Possible plan statuses:

- `native`
- `selected`
- `no-sdk`
- `needs-input`
- `blocked`

Web Platform is preferred whenever it fully covers every required capability. Optional capabilities never force an SDK dependency. Third-party provider sets are minimized and must remain within `maxProviders`.

The route identity excludes creation time, project absolute root, request capability order, and catalog enumeration order.

## Connector status

- Web Platform, Motion, and GSAP are approved Connector Manifest v2 records and are selectable by the Phase 4 router.
- Motion runtime is pinned to `motion@12.42.2` with `motion/react` and `motion` import paths.
- GSAP runtime is pinned to `gsap@3.15.0` under `LicenseRef-GSAP-Standard`.
- Documentation, official Agent Skills, and hosted MCP metadata are distinct integration artifacts.
- Motion AI Kit 6.2.0 is cataloged as a knowledge/tool surface and is never selectable by the Phase 4 runtime router.
- Lenis, React Three Fiber, Storybook, shadcn, and other planning connectors remain legacy and non-selectable.
- Connector documents are parsed as untrusted data and never executed by the catalog or router.

Standards:

- [`docs/SDK-CONNECTOR-STANDARD.md`](./docs/SDK-CONNECTOR-STANDARD.md)
- [`schemas/connector.schema.json`](./schemas/connector.schema.json)
- [`capabilities/catalog.json`](./capabilities/catalog.json)

## Package structure

```text
packages/
├── contracts/       # schemas, validation, canonical JSON, digests
├── core/            # catalog service, project inspector, deterministic router
├── connectors/      # connector loading, health, snapshots, storage
├── cli/             # read-only inspect, route, and catalog CLI
├── protocol-server/ # planned
└── testing/         # planned
```

Applications such as the Control Center remain planned clients of the core. They will never become the system of record.

## Next milestone

Phase 5 will expand governance around the Route Plan without crossing the write boundary:

1. Project and organization policy composition
2. Configuration and lockfile enforcement
3. Broader connector compatibility evaluation
4. Read-only context packaging for selected providers
5. Evidence-backed route and verification reporting

External execution, package installation, and project mutation remain out of scope until separately approved and sandboxed.

## Security position

- Retrieved documentation and tool metadata are untrusted input.
- Connector files are data, not executable instructions.
- Project inspection and routing are static and read-only.
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

Or run the complete gate:

```bash
pnpm check
```

## Roadmap

Completed:

- Architecture Hardening v2
- Phase 1 contracts
- Phase 2 catalog and SQLite snapshots
- Phase 3 project inspector
- Phase 4 Web Platform + Motion + GSAP routing

Next:

- Policy, configuration, and lockfile enforcement
- Universal CLI/REST/MCP/TypeScript surfaces
- Context broker and read-only tool gateway
- Plan, verification, and evidence services
- Approved apply sandbox after release `0.1`
- Remaining first-wave connectors
- Soren Design System integration
- Control Center

See [`docs/ROADMAP.md`](./docs/ROADMAP.md).
