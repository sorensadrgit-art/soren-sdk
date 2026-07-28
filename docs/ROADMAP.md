# Soren SDK Roadmap v2

## Strategy

Build one secure, inspectable vertical slice before expanding the catalog or creating the Control Center.

The MVP is read-only. It must prove that Soren SDK can inspect a project, select native or SDK providers correctly, explain the decision, and produce a reproducible route plan.

## Phase 0 — Architecture hardening

Deliverables:

- Architecture review
- Platform Contracts v2
- Threat model
- Connector Schema v2
- Capability catalog draft
- Native-provider requirement
- License policy
- GitHub security policy
- CODEOWNERS
- Existing connectors marked non-selectable until migrated

Exit criteria:

- No document treats source authority as connector authorship
- No machine version field contains prose
- Security and execution boundaries are explicit
- CLI, REST, MCP, and TypeScript SDK parity is an invariant
- The repository has one authoritative roadmap

## Phase 1 — Contract implementation

Create:

- `@soren-sdk/contracts`
- JSON Schema validation
- TypeScript types generated or synchronized from schemas
- Canonical JSON serialization
- Typed error model
- Evidence schema
- Project snapshot schema
- Route plan schema
- Execution plan schema
- Policy schema
- Lockfile schema

Exit criteria:

- Valid fixtures pass
- Invalid fixtures fail with actionable errors
- Schema changes require migration tests
- All first-wave manifests validate or remain explicitly blocked

## Phase 2 — Compact core and CLI

Create:

- `@soren-sdk/core`
- `@soren-sdk/connectors`
- `@soren-sdk/cli`
- SQLite storage adapter
- Catalog snapshot loader
- Capability registry loader
- Connector status and blocker handling

CLI target:

```bash
soren-sdk catalog list
soren-sdk catalog get motion
soren-sdk connector health motion
```

Exit criteria:

- Catalog loading is deterministic
- Non-selectable connectors cannot enter routes
- Catalog snapshot has a stable digest

## Phase 3 — Project inspector

Detect:

- Package manager
- Workspace graph
- Framework and React versions
- Lockfile digest
- Installed dependencies
- Motion, scroll, WebGL, component, and testing tools
- Storybook and shadcn configuration
- Existing ownership declarations
- Soren SDK config and policy files
- Browser and runtime targets

Exit criteria:

- Inspector is read-only
- Output is content-addressed
- Clean Next.js, Soren Design System, and animation-heavy fixtures pass

## Phase 4 — First routing vertical slice

Implement only:

- Web Platform
- Motion
- GSAP

Capabilities:

- CSS transition
- CSS animation
- WAAPI
- Presence
- Layout
- Gesture and drag
- Timeline
- ScrollTrigger and pinned sequence

Route statuses:

- `native`
- `selected`
- `no-sdk`
- `needs-input`
- `blocked`

Exit criteria:

- Hard constraint violations: 0
- Forbidden connector selections: 0
- Native solution selected for simple cases
- Existing approved dependency reused
- Motion/GSAP ownership conflicts rejected
- Route explanation is human-readable
- 30+ positive, negative, and metamorphic fixtures pass

## Phase 5 — Policy, configuration, and lockfile

Add:

```text
.soren-sdk/config.yaml
.soren-sdk/policy.yaml
soren-sdk.lock
```

Policies cover:

- Allowed connectors
- Experimental status
- License
- Paid services
- Network
- Filesystem
- Remote project content
- Bundle budgets
- Accessibility
- Required approval

Exit criteria:

- Higher-level denies cannot be weakened
- Same snapshot and lock produce the same route
- Policy decisions are included in evidence

## Phase 6 — Universal protocol surfaces

Implement:

- CLI
- REST
- MCP
- TypeScript SDK

All surfaces expose the same operations and schemas.

Add agent capability negotiation rather than hardcoded routing logic.

Optional setup profiles:

- Hermes
- OpenClaw
- OpenCode
- Codex
- Claude Code
- Other clients

Exit criteria:

- Contract tests prove equivalent behavior
- No SDK knowledge is duplicated in agent profiles
- No model ID is required by core contracts

## Phase 7 — Context broker and tool gateway

Add:

- Progressive connector context
- Agent Skills validation
- Source freshness and digest checks
- MCP protocol negotiation
- Tool inventory and diff
- Per-run grants
- Read-only tool calls
- Audit events
- Kill switch
- Fallback behavior

MCP baseline:

- Support current stable protocol negotiation
- Keep release-candidate support behind a feature flag until final and tested
- Treat official registry records as discovery, not approval

Exit criteria:

- Retrieved content cannot grant permissions
- Tool changes require review when material
- Remote project-content exposure requires explicit policy and consent

## Phase 8 — Plan and verification

Add:

- Dependency plan
- File-change plan
- Command plan
- Permission plan
- Verification plan
- Evidence envelope
- Affected-scope checks
- Screenshot and performance artifacts

Still no automatic apply.

Exit criteria:

- Plans are reviewable and content-addressed
- Evidence distinguishes passed, failed, not-required, and not-run
- Required checks cannot be marked passed without runner evidence

## Phase 9 — Approved apply sandbox

Add:

- Branch or worktree isolation
- Exact-plan approval
- Plan-drift detection
- Command allowlist
- Filesystem and network scopes
- Time and resource limits
- Before-state snapshot
- Rollback
- Diff
- Post-apply verification

Exit criteria:

- No direct protected-branch writes
- Failed apply can be rolled back or clearly reports rollback failure
- Approval is scoped to one immutable plan
- Mutation is auditable

## Phase 10 — Remaining first-wave connectors

Activate in this order:

1. Lenis
2. React Three Fiber
3. Storybook
4. shadcn

Each connector must migrate to Schema v2 and pass:

- Contract tests
- Positive routes
- Negative routes
- Metamorphic routes
- Security review
- Implementation benchmark
- Human review

## Phase 11 — Soren Design System integration

Reference workflow:

```text
Hermes
→ primary implementation

OpenClaw
→ independent audit
```

Both use the same normalized route, policy, context, and evidence.

Deliverables:

- Storybook component context
- Private shadcn registry
- Approved motion recipes
- Design-system policy
- Multi-SDK benchmark
- GitHub PR workflow

## Phase 12 — Control Center

Build only after the APIs are stable.

Views:

- Catalog and capability explorer
- Connector blockers
- Source freshness
- Integration permissions
- MCP and skill status
- Policy decisions
- Route explanations
- Evaluation results
- Evidence history
- Workspace dependency graph

The UI remains a client of the core.

## Phase 13 — Expansion

Potential connector waves:

### Motion and creative media

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

No connector is added merely because it is popular. It must satisfy a defined capability gap.

## Release 0.1 definition of done

Release 0.1 is read-only and complete when:

- Contracts validate
- SQLite catalog snapshots work
- Project inspection works
- Web Platform, Motion, and GSAP route correctly
- Policy and lockfile work
- CLI, REST, MCP, and TypeScript SDK are contract-equivalent
- Context is selectively loaded
- Tool access is read-only and permissioned
- Verification and evidence work
- Hard safety gates have zero failures
- Hermes and OpenClaw can consume the same route package

Package mutation and command execution are explicitly out of scope for 0.1.
