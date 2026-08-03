# Soren SDK

> Agent-native SDK intelligence, project inspection, cataloging, native-first routing, policy, execution planning, and verification for premium frontend development.

**Repository:** `sorensadrgit-art/soren-sdk`  
**Stable branch:** `main`  
**Active development:** `feat/router-vertical-slice-v1` / [PR #12](https://github.com/sorensadrgit-art/soren-sdk/pull/12)  
**Runtime:** Node.js 24, pnpm 11.17.0, TypeScript 6  
**Primary owner:** Soren

## What Soren SDK is

Soren SDK is the intelligence and governance layer between a structured frontend capability request and the technologies used to implement it.

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
Ownership-safe Route Plan
        ↓
Selective context, planning, and verification
```

Release `0.1` remains read-only. Package installation, command execution, external tool invocation, code generation, and application-source mutation are not enabled.

## Implementation status

| Milestone | Status | Result |
|---|---|---|
| Architecture Hardening v2 | Complete | Agent-neutral architecture, connector model, threat model, license policy, and security boundaries |
| Phase 1 — Contracts | Complete and merged | Versioned schemas, runtime validation, canonical JSON, digests, typed errors, fixtures, and CI |
| Phase 2 — Catalog and snapshots | Complete and merged | Deterministic catalog, connector health, content-addressed snapshots, SQLite storage, and catalog CLI |
| Phase 3 — Project inspector | Complete and merged | Static project detection and deterministic `ProjectSnapshot` generation |
| Phase 4 — Native-first router | Implementation complete on PR #12; final review pending | Web Platform, Motion, and GSAP routing, evaluations, and explicit route CLI |

## Completed executable layers

### Contracts

`@soren-sdk/contracts` provides JSON Schema Draft 2020-12 contracts, Connector Manifest v2 validation, canonical JSON, deterministic SHA-256 digests, typed errors, fixtures, migration scaffolding, and repository validation.

### Catalog and snapshots

`@soren-sdk/connectors` and `@soren-sdk/core` provide deterministic connector discovery, legacy isolation, connector health/freshness diagnostics, content-addressed catalog snapshots, in-memory storage, SQLite persistence, and integrity checks.

### Static project inspector

The inspector detects package managers, lockfiles, workspaces, frameworks, dependencies, configuration and policy digests, browser/runtime targets, and static Git metadata without running Git, package managers, subprocesses, or network requests.

### Native-first router

Phase 4 implements:

- Healthy approved Connector Manifest v2 records for Web Platform, Motion, and GSAP
- `motion@12.42.2` with MIT licensing
- `gsap@3.15.0` with `LicenseRef-GSAP-Standard`
- Immutable built-in read-only policy and tightening-only overrides
- Runtime-artifact, license, paid-service, health, forbidden-provider, and environment checks
- Conservative Motion React `18.2+` compatibility validation
- Native-first deterministic provider-set selection
- Existing approved dependency reuse
- Provider-set minimization
- Motion/GSAP ownership conflict and ambiguity handling
- `native`, `selected`, `no-sdk`, `needs-input`, and `blocked` outcomes
- Contract-valid, content-addressed `RoutePlan` records
- Stable selected/rejected-provider reason codes
- 36 data-driven golden routing cases plus unit and metamorphic tests
- Explicit-capability `soren-sdk route` CLI
- Canonical JSON, human output, exit-code, deterministic request-ID, and no-write tests

Final independent review, exact-head audit, ready-for-review transition, and merge remain intentionally pending.

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

A healthy connector becomes selectable only after policy, environment, runtime-artifact, capability, provider-limit, and ownership constraints pass.

## Quick start

```bash
pnpm install --frozen-lockfile
pnpm build
```

### Inspect a project

```bash
node packages/cli/dist/bin.js inspect ../my-project
node packages/cli/dist/bin.js inspect ../my-project --json
```

### Route explicit capabilities

Native CSS transition:

```bash
node packages/cli/dist/bin.js route \
  --project ../my-project \
  --capability platform.css-transition \
  --json
```

Motion layout:

```bash
node packages/cli/dist/bin.js route \
  --project ../my-react-project \
  --capability motion.layout \
  --preferred motion \
  --scope card-grid \
  --property layout
```

GSAP timeline:

```bash
node packages/cli/dist/bin.js route \
  --project ../my-project \
  --capability motion.timeline
```

The route command accepts explicit capability IDs only. It does not infer capabilities from prose.

### Explore the catalog

```bash
node packages/cli/dist/bin.js catalog list
node packages/cli/dist/bin.js catalog get motion --json
node packages/cli/dist/bin.js connector health motion --json
node packages/cli/dist/bin.js catalog get gsap --json
```

### Create a catalog snapshot

```bash
node packages/cli/dist/bin.js catalog snapshot --json
node packages/cli/dist/bin.js catalog snapshot \
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

There is no package installation, shell execution, application-source mutation, remote MCP invocation, Agent Skill execution, or router-side network access.

## Package structure

```text
packages/
├── contracts/       # contracts, validation, canonical JSON, digests
├── core/            # catalog service, inspector, policy, router
├── connectors/      # connector loading, health, snapshots, storage
├── cli/             # read-only CLI
├── protocol-server/ # planned
└── testing/         # planned
```

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

Latest full Phase 4 implementation run before documentation finalization: workflow `30643899335`, all steps passed.

## Security position

- Connector and retrieved knowledge files are untrusted data and are never executed.
- Project inspection is static, symlink-safe, and read-only.
- Routing applies hard policy and environment constraints before ranking.
- Forbidden, unhealthy, legacy, blocked, or non-selectable providers cannot be selected.
- Same-scope exclusive ownership conflicts block routing.
- No credentials, agent names, vendor IDs, or model IDs are hardcoded in core routing logic.
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

## Roadmap

Implemented:

- Architecture Hardening v2
- Phase 1 contracts
- Phase 2 catalog and SQLite snapshots
- Phase 3 project inspector
- Phase 4 Web Platform + Motion + GSAP routing implementation

Next after Phase 4 review and merge:

- Phase 5 policy hierarchy, configuration, and `soren-sdk.lock`
- Universal CLI/REST/MCP/TypeScript surfaces
- Context broker and read-only tool gateway
- Plan, verification, and evidence services
- Approved apply sandbox after release `0.1`
- Remaining connector migrations
- Soren Design System integration
- Control Center

See [`docs/ROADMAP.md`](./docs/ROADMAP.md).
