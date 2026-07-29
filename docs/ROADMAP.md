# Soren SDK Roadmap v2

## Strategy

Build secure, inspectable, read-only vertical slices before enabling routing, external tools, or project mutation.

Release `0.1` remains read-only. Package installation, command execution, and project writes are excluded until the apply sandbox receives an independent security review.

## Status

- ✅ Architecture hardening
- ✅ Phase 1 — Versioned contracts
- ✅ Phase 2 — Connector catalog, health, snapshots, SQLite, and CLI
- ✅ Phase 3 — Static content-addressed project inspector
- ▶️ Phase 4 — Web Platform + Motion + GSAP routing vertical slice

---

## Phase 0 — Architecture hardening ✅

Delivered:

- Product and integration-artifact separation
- Connector publisher and source-authority separation
- Native Web Platform requirement
- Policy-aware ownership model
- Universal protocol-surface invariant
- Threat model
- License policy
- CODEOWNERS and repository security policy

## Phase 1 — Contract implementation ✅

Delivered:

- `@soren-sdk/contracts`
- JSON Schema Draft 2020-12 runtime validation
- Connector Manifest v2 structural and semantic checks
- Project, catalog, policy, route, execution, evidence, error, and lockfile contracts
- Canonical JSON and deterministic SHA-256 digests
- Typed errors and migration scaffolding
- Adversarial fixtures and permanent CI

## Phase 2 — Compact catalog core and CLI ✅

Delivered:

- `@soren-sdk/core`
- `@soren-sdk/connectors`
- `@soren-sdk/cli`
- Deterministic connector discovery
- Lazy loading and legacy isolation
- Connector health, freshness, version, license, and related-file diagnostics
- Content-addressed catalog snapshots
- In-memory and SQLite stores
- SQLite integrity and tamper checks
- Catalog list/get/health/snapshot commands

## Phase 3 — Read-only project inspector ✅

Delivered:

- Static package-manager and lockfile detection
- npm, pnpm, Yarn, and Bun support
- pnpm and package.json workspace patterns
- Stable workspace graph
- Dependency, framework, and runtime inventory
- Storybook, shadcn, framework, testing, TypeScript, lint, Soren configuration, and policy detection
- Browser and runtime targets
- Static Git HEAD, loose-ref, packed-ref, and worktree metadata parsing
- Safe commit-hash and ref validation
- Symlink-safe filesystem discovery
- Package-manifest, workspace, configuration, policy, lockfile, target, and revision hashing
- Deterministic `ProjectSnapshot`
- `soren-sdk inspect [path] [--json]`

Known intentional limitation:

- Git projects are conservatively reported dirty because the inspector does not execute `git status`.

---

## Phase 4 — First routing vertical slice ▶️

Implement only:

- Web Platform
- Motion
- GSAP

Capabilities:

- CSS transitions and animations
- Web Animations API
- Presence and layout animation
- Gesture and drag
- Timelines
- ScrollTrigger and pinned sequences

Route outcomes:

- `native`
- `selected`
- `no-sdk`
- `needs-input`
- `blocked`

Required behavior:

- Native Web Platform candidates are evaluated first.
- Existing approved dependencies receive a reuse preference.
- Hard policy and environment constraints run before scoring.
- Provider sets are minimized.
- Motion and GSAP cannot own the same property on the same scope.
- Ambiguous material decisions return `needs-input`.
- Impossible routes return `blocked`.
- Explanations list selected and rejected providers without hidden reasoning.

Hard exit gates:

- Zero hard-policy violations
- Zero forbidden-provider selections
- Zero unresolved ownership conflicts
- Native provider wins simple cases
- At least 30 positive, negative, and metamorphic fixtures pass

## Phase 5 — Policy, configuration, and lockfile

Add:

```text
.soren-sdk/config.yaml
.soren-sdk/policy.yaml
soren-sdk.lock
```

Policies cover:

- Allowed and denied connectors
- Experimental status
- License
- Paid services
- Network and filesystem permissions
- Remote project content
- Bundle budgets
- Accessibility requirements
- Required approvals

Exit gates:

- Higher-level denies cannot be weakened.
- Identical project, catalog, policy, and lock snapshots reproduce the same route.
- Policy decisions are included in evidence.

## Phase 6 — Universal protocol surfaces

Expose equivalent operations through:

- CLI
- REST
- MCP
- TypeScript SDK

Add agent capability negotiation rather than vendor-specific core logic.

Optional setup profiles may support Hermes, OpenClaw, OpenCode, Codex, Claude Code, and other clients without duplicating connector knowledge.

## Phase 7 — Context broker and read-only tool gateway

Add:

- Progressive connector context
- Agent Skills validation
- Source freshness and digest checks
- MCP protocol negotiation
- Tool inventory and change review
- Per-run grants
- Read-only tool calls
- Audit events
- Kill switch
- Prompt-injection boundaries

Retrieved content cannot grant itself permissions or escalate a run.

## Phase 8 — Plan, verification, and evidence

Add:

- Dependency plan
- File-change plan
- Command and permission plan
- Verification planner
- Evidence envelope
- Affected-scope checks
- Screenshot and performance artifacts
- Runner-generated pass/fail evidence

No automatic apply.

## Phase 9 — Approved apply sandbox

Excluded from release `0.1`.

Requires:

- Branch or worktree isolation
- Exact-plan approval
- Plan-drift detection
- Filesystem and network scopes
- Command allowlist
- Time and resource limits
- Before-state snapshot
- Diff and rollback
- Post-apply verification

## Phase 10 — Remaining first-wave connectors

Migrate and activate only after Schema v2 and evaluations pass:

1. Lenis
2. React Three Fiber
3. Storybook
4. shadcn

Every connector requires contract, routing, security, implementation, and human-quality review.

## Phase 11 — Soren Design System integration

Reference workflow:

```text
Hermes → primary planner and implementer
OpenClaw → independent auditor and conflict reviewer
```

Deliver:

- Storybook component context
- Private shadcn registry
- Approved premium motion recipes
- Design-system policy
- Multi-SDK benchmarks
- Evidence-backed GitHub pull-request workflow

## Phase 12 — Control Center

Build only after core use-case APIs stabilize.

The Control Center will display catalog, project, policy, route, evaluation, and evidence state. It remains a client of the core and never becomes the system of record.

## Phase 13 — Controlled expansion

Potential future connector groups:

### Creative motion and media

- Rive
- Lottie
- Theatre.js
- Spline
- PixiJS

### UI architecture

- Base UI
- Radix
- React Aria
- Floating UI
- Tailwind CSS
- React Hook Form
- Zod

### Data and advanced tools

- TanStack Query
- TanStack Table
- D3
- Mapbox
- Monaco
- Tiptap

A connector is added only when it fills a defined capability gap.

## Release 0.1 definition of done

- [x] Contracts validate
- [x] Deterministic catalog snapshots work
- [x] SQLite persistence and integrity checks work
- [x] Static project inspection works
- [ ] Web Platform, Motion, and GSAP route correctly
- [ ] Policy and lockfile enforcement work
- [ ] CLI, REST, MCP, and TypeScript SDK are contract-equivalent
- [ ] Context is selective
- [ ] Tool access is read-only and permissioned
- [ ] Verification and evidence services work
- [ ] Hard safety gates have zero failures
- [ ] Reference agents can consume the same route package
