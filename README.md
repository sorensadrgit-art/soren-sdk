# Soren SDK

> Agent-native SDK intelligence, policy, cataloging, routing, tool brokering, execution planning, and verification for premium frontend development.

**Repository:** `sorensadrgit-art/soren-sdk`  
**Status:** Phase 2 executable catalog foundation  
**Primary owner:** Soren  
**Runtime baseline:** Node.js 24, pnpm 11.17.0, TypeScript 6  
**Reference workflow:** Hermes may implement; OpenClaw or another independent reviewer audits before merge

## What Soren SDK is

Soren SDK is a platform that helps coding agents correctly discover, select, combine, and verify modern frontend SDKs.

It is not an animation library, a package installer, or a prompt containing every SDK. It is the intelligence and governance layer between a user request and the SDKs used to implement that request.

```text
User request
    ↓
Authenticated run context
    ↓
Read-only project snapshot
    ↓
Capability resolution
    ↓
Native and SDK provider candidates
    ↓
Policy and hard constraints
    ↓
Smallest safe provider set
    ↓
Ownership plan
    ↓
Selective context and tool plan
    ↓
Reviewable execution plan
    ↓
Optional explicitly approved apply
    ↓
Verification and evidence
```

## Current executable foundation

The repository now contains two completed implementation phases.

### Phase 1 — Contracts

`@soren-sdk/contracts` provides:

- JSON Schema Draft 2020-12 contracts
- Connector Manifest v2 structural and semantic validation
- Capability, project, catalog, policy, route, execution, evidence, error, and lockfile contracts
- Canonical JSON serialization
- Deterministic SHA-256 digests
- Typed errors
- Explicit migration scaffolding
- Repository-wide contract validation

### Phase 2 — Read-only catalog and CLI

The current executable layer provides:

- `@soren-sdk/core` — provider-neutral catalog interfaces and service
- `@soren-sdk/connectors` — filesystem catalog, health evaluation, deterministic snapshots, and storage adapters
- `@soren-sdk/cli` — read-only catalog commands
- Real SQLite snapshot persistence through Node.js `node:sqlite`
- Permanent CI with frozen lockfile, pinned Actions, read-only permissions, tests, builds, repository validation, and CLI smoke checks

No routing, SDK scoring, MCP execution, package installation, command execution, or project mutation exists yet.

## Try the catalog CLI

Install and build:

```bash
pnpm install --frozen-lockfile
pnpm build
```

List the catalog:

```bash
node packages/cli/dist/bin.js catalog list
node packages/cli/dist/bin.js catalog list --json
```

Inspect one connector:

```bash
node packages/cli/dist/bin.js catalog get web-platform --json
```

Inspect connector health:

```bash
node packages/cli/dist/bin.js connector health web-platform --json
```

Create a deterministic snapshot without writing a database:

```bash
node packages/cli/dist/bin.js catalog snapshot --json
```

Persist the snapshot to an explicitly requested local SQLite database:

```bash
node packages/cli/dist/bin.js \
  catalog snapshot \
  --database .soren-sdk/catalog.sqlite \
  --json
```

### CLI write boundary

These commands are read-only:

- `catalog list`
- `catalog get`
- `connector health`
- `catalog snapshot` without `--database`

Only `catalog snapshot --database <path>` creates or updates a file, and it writes only to the requested SQLite database.

## Connector catalog behavior

The catalog:

- Loads and validates `capabilities/catalog.json`
- Discovers `sdk-connectors/*` deterministically
- Skips only underscore-prefixed template directories
- Loads connector manifests lazily
- Keeps legacy manifests visible but permanently non-selectable
- Rejects missing, malformed, invalid, and duplicate connector manifests
- Treats connector files as untrusted data
- Never imports or executes connector runtime artifacts

Connector health reports:

- Review and selectable state
- Explicit blockers
- Source freshness
- Unresolved available artifact versions
- Unresolved executable-artifact licenses
- Missing related files marked present
- Related paths escaping connector boundaries

Health is diagnostic information. It is not a routing approval.

## Deterministic catalog snapshots

Catalog snapshots contain:

- Capability-catalog digest
- Sorted Schema v2 connector records
- Connector content digests
- Review and selectable status
- Stable snapshot ID

The snapshot ID excludes `createdAt`, so identical catalog content produces the same ID at different times and in different filesystem enumeration orders.

Storage is defined through a replaceable `CatalogSnapshotStore` interface.

Current adapters:

- In-memory store for tests and temporary processes
- SQLite store for local persistence

The SQLite adapter uses prepared statements, canonical JSON, contract validation, integrity verification, and explicit resource closure. It makes no network calls and loads no extensions.

## Core product systems

### Capability ontology

Provider-independent behaviors such as:

- `platform.css-transition`
- `motion.layout`
- `motion.timeline`
- `scroll.smooth-transport`
- `webgl.react-scene`
- `registry.install`

### Connector catalog

Separates an SDK product from its integration artifacts:

- Runtime package
- MCP server
- Agent Skill
- Documentation source
- CLI
- Validator
- Recipe source

### Policy engine — planned

Will enforce allowed SDKs, licenses, versions, paid services, network and filesystem access, experimental status, bundle budgets, accessibility, and approvals.

### Router — planned

Will select the smallest provider set satisfying capabilities and policy.

Valid outcomes will include:

- `native`
- `selected`
- `no-sdk`
- `needs-input`
- `blocked`

### Context broker and tool gateway — planned

Will load only task-relevant knowledge and broker external tools through explicit permissions, version negotiation, inventory checks, and audit events.

### Plan and apply — planned

`plan` remains read-only.

`apply` will be a later, explicitly approved operation requiring isolation, scoped permissions, plan-drift detection, rollback data, diff review, and verification.

## First routing vertical slice

After the project inspector, the first router will support only:

1. Web Platform
2. Motion
3. GSAP

It must correctly determine:

- When CSS is enough
- When Web Animations API is enough
- When Motion is correct
- When GSAP is correct
- When Motion and GSAP may coexist
- When user input is required
- When policy blocks a route

Only after that slice is proven will Lenis, React Three Fiber, Storybook, and shadcn become active routing candidates.

## Current connector status

- `web-platform` is the first Schema v2 connector.
- Motion, GSAP, Lenis, React Three Fiber, Storybook, and shadcn remain legacy planning manifests.
- Legacy manifests are visible through the catalog but never selectable.
- Connectors remain non-selectable until required versions, licenses, related files, permissions, compatibility rules, and evaluations resolve.

Standards:

- [`docs/SDK-CONNECTOR-STANDARD.md`](./docs/SDK-CONNECTOR-STANDARD.md)
- [`schemas/connector.schema.json`](./schemas/connector.schema.json)
- [`capabilities/catalog.json`](./capabilities/catalog.json)

## Repository structure

```text
soren-sdk/
├── packages/
│   ├── contracts/
│   ├── core/
│   ├── connectors/
│   ├── cli/
│   ├── protocol-server/      # planned
│   └── testing/              # planned
├── sdk-connectors/
├── capabilities/
├── schemas/
├── evaluations/
├── apps/
│   ├── control-center/       # planned
│   ├── docs/                 # planned
│   ├── evaluation-lab/       # planned
│   └── playground/           # planned
├── docs/
├── AGENTS.md
└── README.md
```

## Security position

- Public documentation and tool metadata are untrusted input
- Connector files are parsed as data and never executed by the catalog
- Runtime packages belong only in target workspaces
- No silent global skill installation
- No hardcoded credentials, agents, or model IDs
- No token passthrough
- Remote MCP servers will require policy approval
- Mutating tools will require explicit consent
- Project inspection will remain read-only
- Protected branches change through pull requests
- Releases require evidence-backed checks

Read:

- [`SECURITY.md`](./SECURITY.md)
- [`docs/GOVERNANCE-SECURITY.md`](./docs/GOVERNANCE-SECURITY.md)
- [`docs/THREAT-MODEL.md`](./docs/THREAT-MODEL.md)
- [`docs/LICENSE-POLICY.md`](./docs/LICENSE-POLICY.md)

## Roadmap

Completed:

1. Architecture hardening
2. Contract implementation
3. Compact read-only catalog and CLI

Next:

4. Read-only project inspector
5. Web Platform + Motion + GSAP routing slice
6. Policy, configuration, and lockfile
7. Universal protocol surfaces
8. Context broker and tool gateway
9. Plan and verification
10. Approved apply sandbox
11. Remaining first-wave connectors
12. Soren Design System integration
13. Control Center
14. Controlled connector expansion

Read [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Release direction

Release `0.1` remains read-only.

Package installation, command execution, and application-source mutation are explicitly out of scope until the apply sandbox is implemented and independently reviewed.
