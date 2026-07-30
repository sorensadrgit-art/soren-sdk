# Phase 4 Native-First Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic, read-only capability routing for Web Platform, Motion, and GSAP, including Connector Manifest v2 migrations, a built-in policy, provider-set minimization, ownership checks, a CLI command, and permanent evaluation coverage.

**Architecture:** Keep contracts provider-neutral and implement routing inside `@soren-sdk/core`. The router reads only explicit `RouteRequest`, `ProjectSnapshot`, a `CatalogReader`, and an optional policy; it never invokes packages, tools, commands, networks, or project writes. Connector manifests remain untrusted catalog data, while deterministic policy and route digests are produced with `@soren-sdk/contracts` canonical JSON helpers.

**Tech Stack:** Node.js 24, TypeScript 6, pnpm 11.17.0, Vitest 4, JSON Schema Draft 2020-12, existing Soren SDK contracts/catalog/inspector packages.

## Global Constraints

- Only `web-platform`, `motion`, and `gsap` are selectable in this phase.
- No natural-language inference, package installation, code generation, MCP execution, network access, commands, or project writes.
- Hard constraints run before scoring.
- Required capabilities must be fully covered.
- Native Web Platform wins all approved simple-native cases.
- Motion React claims require React 18.2 or newer.
- Provider sets are minimized and `maxProviders` is enforced.
- Explicit same-scope/same-property exclusive ownership conflicts return `blocked`.
- Route identity is independent of creation time, request capability order, catalog enumeration order, and project clone path.
- Final plans must validate against the existing `route-plan` contract.

---

### Task 1: Add failing router contract tests

**Files:**
- Create: `packages/core/test/router.test.ts`
- Create: `packages/core/test/router-fixtures.test.ts`
- Create: `packages/core/test/fixtures/route-cases.ts`

**Interfaces:**
- Consumes: `RouteRequest`, `ProjectSnapshot`, `CatalogReader`, `ConnectorManifest` from existing packages.
- Produces: test expectations for `routeCapabilities(input: RouteInput): RoutePlan`.

- [ ] Write a minimal failing test for native CSS routing with no selected third-party providers.
- [ ] Write failing tests for Motion presence, GSAP timeline, mixed separate-scope composition, ownership conflict, provider limits, forbidden providers, unsupported React, unknown required and optional capabilities, existing dependency reuse, and deterministic digests.
- [ ] Add at least 30 named golden/metamorphic cases in `route-cases.ts`.
- [ ] Run `pnpm --filter @soren-sdk/core test`; verify failure is caused by the missing router export.

### Task 2: Add built-in Phase 4 policy and router types

**Files:**
- Create: `packages/core/src/router/policy.ts`
- Create: `packages/core/src/router/types.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `PHASE_4_POLICY`, `getPhase4PolicySnapshotId()`, `RouteInput`, stable reason-code constants, and router-specific internal types.

- [ ] Define a built-in policy allowing only the three phase providers, MIT, `LicenseRef-GSAP-Standard`, and `not-applicable` runtime licenses.
- [ ] Deny network, project writes, commands, remote project content, and paid services; require reduced motion.
- [ ] Compute the policy snapshot ID from canonical policy content.
- [ ] Export the public types and policy helpers.
- [ ] Run focused tests and typecheck.

### Task 3: Implement deterministic router core

**Files:**
- Create: `packages/core/src/router/route-capabilities.ts`
- Create: `packages/core/src/router/candidates.ts`
- Create: `packages/core/src/router/ownership.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `routeCapabilities(input: RouteInput): RoutePlan`.

- [ ] Validate route request, project snapshot, policy, catalog snapshot, and final route plan through `assertContract`.
- [ ] Verify `request.projectSnapshotId === project.snapshotId`.
- [ ] Resolve only healthy, selectable Connector Manifest v2 records permitted by policy.
- [ ] Apply provider forbids, policy allowlists, integration license/risk/data-exposure/paid-service rules, Motion React compatibility, required companion runtime availability, and `maxProviders` before scoring.
- [ ] Enumerate sufficient provider sets, minimize provider count, prefer native claims, reuse existing dependencies, honor preferred-provider order, rank support/confidence, and use stable IDs only for behaviorally equivalent ties.
- [ ] Return `needs-input` for materially different valid tied architectures.
- [ ] Resolve ownership from explicit capability `quality.scope` and `quality.property`, falling back to capability-specific scopes; block same-scope/same-property exclusive conflicts.
- [ ] Build stable selected/rejected explanations and constraints with the Issue #9 reason codes.
- [ ] Compute `digest` and `planId` from a canonical payload excluding creation time and the digest fields themselves.
- [ ] Run focused router tests until green.

### Task 4: Migrate and approve the three provider connectors

**Files:**
- Modify: `sdk-connectors/web-platform/sdk.manifest.json`
- Modify: `sdk-connectors/motion/sdk.manifest.json`
- Modify: `sdk-connectors/gsap/sdk.manifest.json`
- Create: `sdk-connectors/{web-platform,motion,gsap}/SKILL.md`
- Create: `sdk-connectors/{web-platform,motion,gsap}/docs.sources.json`
- Create: `sdk-connectors/{web-platform,motion,gsap}/compatibility.json`
- Create: `sdk-connectors/{web-platform,motion,gsap}/evaluations/route-cases.json`

**Interfaces:**
- Produces: three healthy, approved, selectable v2 connectors with only the explicit Phase 4 capabilities.

- [ ] Resolve product/runtime versions, packages, imports, licenses, publisher/source authority, and related files.
- [ ] Represent documentation and official skill artifacts separately from runtime packages.
- [ ] Keep remote/paid Motion AI integrations unavailable to selection through artifact-level constraints.
- [ ] Encode ownership domains and focused compatibility rules.
- [ ] Mark related files `present` only after creating them.
- [ ] Run repository validation and connector health tests.

### Task 5: Add the explicit route CLI

**Files:**
- Modify: `packages/cli/src/run.ts`
- Modify: `packages/cli/src/format.ts`
- Modify: `packages/cli/test/cli.test.ts`
- Modify: `packages/cli/README.md`

**Interfaces:**
- Consumes: `inspectProject`, `FileSystemConnectorCatalog`, `routeCapabilities`.
- Produces: `soren-sdk route --project <path> --capability <id> ...`.

- [ ] Write failing CLI tests for repeated required/optional capabilities, preferred/forbidden providers, provider limit, scope/property quality, JSON output, invalid numbers, and missing capabilities.
- [ ] Parse only explicit flags with `node:util.parseArgs`; do not accept prose inference.
- [ ] Build a deterministic request ID from normalized flag content and the project snapshot ID.
- [ ] Print canonical JSON with `--json`; otherwise print status, providers, reasons, constraints, required input, and plan ID.
- [ ] Preserve exit `0` for valid route plans, exit `2` for usage errors, and exit `1` for operational/contract failures.
- [ ] Run CLI tests and smoke commands.

### Task 6: Add permanent CI, documentation, and repository smoke coverage

**Files:**
- Modify: `.github/workflows/contracts-ci.yml`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `packages/core/README.md`

**Interfaces:**
- Produces: permanent router tests and CLI smoke gates.

- [ ] Add human and JSON route smoke commands that route a native capability against this repository.
- [ ] Document Phase 4 outcomes, read-only boundaries, reason codes, ownership input, and examples.
- [ ] Mark Phase 4 complete only after verification passes.

### Task 7: Verify and prepare review

**Files:**
- No production files unless verification exposes defects.

- [ ] Run `pnpm lint`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm validate:repository`.
- [ ] Run `pnpm smoke:cli`.
- [ ] Confirm no subprocess, network, package installation, tool invocation, or project writes were introduced.
- [ ] Confirm at least 30 route cases pass and all final `RoutePlan` values validate.
- [ ] Open a pull request referencing and closing Issue #9; do not merge until independent review and CI succeed.
