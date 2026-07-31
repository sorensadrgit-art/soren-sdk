# Soren SDK

> Agent-native SDK intelligence, project inspection, cataloging, native-first routing, policy, execution planning, and verification for premium frontend development.

**Repository:** `sorensadrgit-art/soren-sdk`  
**Stable branch:** `main`  
**Active development:** `feat/router-vertical-slice-v1` / [PR #12](https://github.com/sorensadrgit-art/soren-sdk/pull/12)  
**Runtime:** Node.js 24, pnpm 11.17.0, TypeScript 6  
**Primary owner:** Soren

## What Soren SDK is

Soren SDK is the intelligence and governance layer between a user request and the frontend technologies used to implement that request.

It is not an animation library, a package installer, or one giant prompt containing every SDK. It gives coding agents versioned contracts, reviewed connector knowledge, deterministic project context, policy boundaries, ownership rules, routing decisions, verification requirements, and evidence.

```text
Structured capability request
        ↓
Read-only project snapshot
        ↓
Reviewed connector catalog
        ↓
Policy and environment constraints
        ↓
Native-first provider selection
        ↓
Ownership-safe route plan
        ↓
Selective context and tools
        ↓
Verification and evidence
```

Release `0.1` remains read-only. Package installation, command execution, external tool invocation, code generation, and application-source mutation are not enabled.

## Implementation status

| Milestone | Status | Result |
|---|---|---|
| Architecture Hardening v2 | Complete | Agent-neutral architecture, connector model, threat model, license policy, and security boundaries |
| Phase 1 — Contracts | Complete and merged | Versioned schemas, runtime validation, canonical JSON, digests, typed errors, fixtures, and CI |
| Phase 2 — Catalog and snapshots | Complete and merged | Deterministic catalog, connector health, content-addressed snapshots, SQLite storage, and catalog CLI |
| Phase 3 — Project inspector | Complete and merged | Static project detection and deterministic `ProjectSnapshot` generation |
| Phase 4 — Native-first router | In progress on PR #12 | Web Platform, Motion, and GSAP routing vertical slice |

## Completed work

### Architecture Hardening v2

The repository now has:

- Separate SDK product and integration-artifact models
- Separate connector publisher and source-authority fields
- Native Web Platform as a first-class provider
- Explicit trust, execution-risk, data-exposure, permission, license, and blocker fields
- Agent-neutral CLI/REST/MCP/TypeScript architecture requirements
- A plan/apply separation
- Threat modeling for prompt injection, malicious tools, supply-chain compromise, unauthorized writes, evidence tampering, and workspace leakage
- CODEOWNERS, security policy, governance rules, and license policy

### Phase 1 — Versioned contracts

`@soren-sdk/contracts` provides:

- JSON Schema Draft 2020-12 contracts
- Connector Manifest v2 structural and semantic validation
- Capability, project, catalog, policy, route, execution, evidence, error, and lockfile contracts
- Canonical JSON serialization
- Deterministic SHA-256 digests
- Typed errors
- Explicit migration scaffolding
- Valid and adversarial invalid fixtures
- Repository-wide contract validation

### Phase 2 — Connector catalog and local snapshots

`@soren-sdk/core`, `@soren-sdk/connectors`, and `@soren-sdk/cli` provide:

- Deterministic connector discovery
- Lazy Connector Manifest loading
- Explicit legacy-manifest isolation
- Stable missing, malformed, invalid, unreadable, and duplicate-manifest errors
- Connector health, source-freshness, version, license, blocker, and related-file diagnostics
- Content-addressed catalog snapshots
- In-memory snapshot storage
- SQLite snapshot storage through a replaceable interface
- Canonical JSON persistence and integrity verification
- Detection of externally tampered SQLite rows
- Read-only catalog CLI commands

### Phase 3 — Static project inspector

The project inspector provides:

- npm, pnpm, Yarn, and Bun detection
- Lockfile selection and raw-byte hashing
- `package.json` and `pnpm-workspace.yaml` workspace discovery
- Stable workspace package inventory
- Runtime, framework, React, and dependency detection
- Motion, scroll, WebGL, component, Storybook, shadcn, testing, TypeScript, lint, and Soren configuration discovery
- Soren policy and browser-target detection
- Static Git HEAD, loose-ref, packed-ref, detached-HEAD, and worktree metadata parsing
- Valid Git commit-hash and safe-ref-path checks
- Symlink-safe recursive discovery
- Deterministic, contract-valid `ProjectSnapshot` records
- `soren-sdk inspect [path] [--json]`

The inspector never executes Git or a package manager. Git projects are conservatively marked dirty because static inspection cannot prove worktree cleanliness.

## Phase 4 progress

Phase 4 is limited to three providers:

1. Web Platform
2. Motion
3. GSAP

### Completed on the Phase 4 branch

- Approved architecture design for a deterministic constrained set-cover router
- Detailed TDD implementation plan
- Web Platform connector completed for routing
- Motion migrated from a legacy planning manifest to Connector Manifest v2
- GSAP migrated from a legacy planning manifest to Connector Manifest v2
- Web Platform, Motion, and GSAP are approved, selectable, healthy, and file-complete
- Motion runtime pinned to `motion@12.42.2` with MIT licensing
- GSAP runtime pinned to `gsap@3.15.0` with `LicenseRef-GSAP-Standard`
- Connector skills, official source registries, compatibility data, and connector-local route cases added
- Built-in immutable Phase 4 read-only policy implemented
- Tightening-only caller policy overrides implemented
- Stable policy digest implemented
- Provider-candidate and environment-filtering layer added
- Conservative React `18.2+` compatibility evaluation added for Motion React claims
- Runtime artifact, license, paid-service, forbidden-provider, connector-health, and dependency-reuse candidate checks added

### Currently under verification

- Provider-candidate construction and React/runtime constraint tests
- Permanent CI on the current candidate-layer branch head

### Still required before Phase 4 is complete

- Ownership assignment and Motion/GSAP same-scope conflict handling
- Provider-set enumeration and deterministic ranking
- Native-first route selection
- `native`, `selected`, `no-sdk`, `needs-input`, and `blocked` outcomes
- Deterministic, contract-valid `RoutePlan` generation
- Stable selected/rejected-provider reason codes
- At least 30 positive, negative, composition, and metamorphic route fixtures
- `soren-sdk route` CLI command using explicit capability flags
- Route CLI no-write and exit-code tests
- Permanent route smoke tests
- Documentation of route inputs and explanations
- Fresh independent security and routing review
- Final exact-head CI
- PR #12 ready-for-review transition and squash merge

Phase 4 does **not** include natural-language capability extraction, package installation, MCP or Agent Skill execution, network access, code generation, or project mutation.

## Current connector status

| Connector | Schema | Status | Selectable |
|---|---|---|---|
| Web Platform | Connector Manifest v2 | Approved and healthy | Yes |
| Motion | Connector Manifest v2 | Approved and healthy | Yes |
| GSAP | Connector Manifest v2 | Approved and healthy | Yes |
| Lenis | Legacy planning manifest | Non-selectable | No |
| React Three Fiber | Legacy planning manifest | Non-selectable | No |
| Storybook | Legacy planning manifest | Non-selectable | No |
| shadcn | Legacy planning manifest | Non-selectable | No |

Connector health is diagnostic. A healthy connector may become a routing candidate only after policy, environment, runtime-artifact, capability, provider-limit, and ownership constraints pass.

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
node packages/cli/dist/bin.js catalog get motion --json
node packages/cli/dist/bin.js connector health motion --json
node packages/cli/dist/bin.js catalog get gsap --json
node packages/cli/dist/bin.js connector health gsap --json
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

The `route` command is not available yet. It is part of the unfinished Phase 4 work.

## Write boundary

These commands are read-only:

- `inspect`
- `catalog list`
- `catalog get`
- `connector health`
- `catalog snapshot` without `--database`

Only `catalog snapshot --database <path>` creates or updates a file, and it writes only to the explicitly requested SQLite database.

There is currently no package installation, shell execution, application-source mutation, remote MCP invocation, Agent Skill execution, or network access.

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

Raw configuration and policy file contents are not copied into the snapshot. Only normalized paths and SHA-256 digests are retained.

## Package structure

```text
packages/
├── contracts/       # schemas, validation, canonical JSON, digests
├── core/            # catalog service, project inspector, routing work
├── connectors/      # connector loading, health, snapshots, storage
├── cli/             # read-only CLI
├── protocol-server/ # planned
└── testing/         # planned
```

Applications such as the Control Center remain planned clients of the core. They will never become the system of record.

## Security position

- Retrieved documentation and tool metadata are untrusted input.
- Connector files are parsed as data and are never imported or executed.
- Project inspection is static and read-only.
- Symlinks are not followed during project discovery.
- Git values are accepted only when they match approved commit and ref formats.
- Runtime packages belong only in target workspaces.
- Routing must apply hard constraints before ranking.
- Forbidden, unhealthy, legacy, blocked, or non-selectable providers cannot be selected.
- No credentials, agents, or model IDs are hardcoded in core routing logic.
- Protected branches change through reviewed pull requests.
- Completion claims require runner-generated evidence.

Read:

- [`SECURITY.md`](./SECURITY.md)
- [`docs/THREAT-MODEL.md`](./docs/THREAT-MODEL.md)
- [`docs/GOVERNANCE-SECURITY.md`](./docs/GOVERNANCE-SECURITY.md)
- [`docs/LICENSE-POLICY.md`](./docs/LICENSE-POLICY.md)
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- [`docs/PLATFORM-CONTRACTS-V2.md`](./docs/PLATFORM-CONTRACTS-V2.md)
- [`docs/superpowers/specs/2026-07-30-phase-4-native-router-design.md`](./docs/superpowers/specs/2026-07-30-phase-4-native-router-design.md)
- [`docs/superpowers/plans/2026-07-30-phase-4-native-router.md`](./docs/superpowers/plans/2026-07-30-phase-4-native-router.md)

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

No Phase 4 task is considered complete until the permanent workflow passes on the exact branch head for that task.

## Roadmap

Completed:

- Architecture Hardening v2
- Phase 1 contracts
- Phase 2 catalog and SQLite snapshots
- Phase 3 project inspector

In progress:

- Phase 4 Web Platform + Motion + GSAP native-first routing

Remaining after Phase 4:

- Phase 5 policy hierarchy, configuration, and `soren-sdk.lock`
- Universal CLI/REST/MCP/TypeScript surfaces
- Context broker and read-only tool gateway
- Plan, verification, and evidence services
- Approved apply sandbox after release `0.1`
- Lenis, React Three Fiber, Storybook, and shadcn connector activation
- Soren Design System integration
- Control Center
- Controlled connector expansion

See [`docs/ROADMAP.md`](./docs/ROADMAP.md).
