# Soren SDK Roadmap v2

## Strategy

Build Soren SDK as a sequence of secure, inspectable, independently testable vertical slices.

The initial release remains read-only. It must prove that the platform can inspect a project, understand requested capabilities, select native or SDK providers correctly, explain the decision, and produce reproducible evidence before any mutation system is introduced.

## Current progress

| Phase | Status | Result |
|---|---|---|
| 0 — Architecture hardening | Complete | Universal, policy-governed architecture and threat model |
| 1 — Contracts | Complete | Versioned schemas, runtime validation, canonical JSON, digests, and CI |
| 2 — Catalog core and CLI | Complete | Deterministic catalog, health, snapshots, SQLite, and read-only CLI |
| 3 — Project inspector | Next | Content-addressed read-only project understanding |
| 4+ | Planned | Routing, policy, protocols, context, verification, and approved apply |

---

## Phase 0 — Architecture hardening ✅

Delivered:

- Architecture review
- Platform Contracts v2
- Threat model
- Connector Schema v2
- Capability ontology draft
- Native-provider requirement
- License policy
- GitHub security policy
- CODEOWNERS
- Existing connectors explicitly non-selectable until migrated

Established invariants:

- Connector publisher is separate from source authority
- SDK products are separate from packages, skills, MCP servers, documentation, and validators
- Native Web Platform capabilities are first-class
- CLI, REST, MCP, and TypeScript SDK must use the same application services
- Core logic contains no required agent or model identity
- Plan and apply are separate contracts
- Retrieved documentation and tool descriptions are untrusted data
- Control Center is a client, never the system of record

---

## Phase 1 — Contract implementation ✅

Delivered `@soren-sdk/contracts` with:

- JSON Schema Draft 2020-12 validation
- Connector Manifest v2 structural and semantic validation
- Capability catalog contract
- Project Snapshot contract
- Catalog Snapshot contract
- Policy contract
- Route Request and Route Plan contracts
- Execution Plan contract
- Evidence and Error envelopes
- `soren-sdk.lock` contract
- TypeScript compatibility types
- Canonical JSON
- SHA-256 digests
- Typed errors
- Explicit migration scaffolding
- Valid and adversarial invalid fixtures
- Repository-level connector validation
- Frozen-lockfile, least-privilege CI

Exit criteria achieved:

- Valid fixtures pass
- Invalid fixtures fail with stable diagnostics
- Unknown stable fields are rejected
- Schema version mismatches are rejected
- Connector semantic false negatives are covered
- Historical migrations have an explicit registry
- Existing first-wave manifests validate or remain visibly legacy and blocked

---

## Phase 2 — Compact core and read-only CLI ✅

Delivered:

### `@soren-sdk/core`

- Provider-neutral catalog interfaces
- Legacy and Schema v2 connector records
- Connector health contracts
- Thin `CatalogService`

### `@soren-sdk/connectors`

- Capability catalog loading
- Deterministic connector discovery
- Lazy manifest loading
- Legacy manifest isolation
- Stable errors for missing, malformed, invalid, and duplicate connector manifests
- Connector health evaluation
- Source freshness diagnostics
- Artifact version and license diagnostics
- Related-file boundary and existence checks
- Deterministic catalog snapshots
- In-memory snapshot store
- SQLite snapshot store using `node:sqlite`
- Contract validation and integrity verification on storage reads

### `@soren-sdk/cli`

```bash
soren-sdk catalog list [--json]
soren-sdk catalog get <connector-id> [--json]
soren-sdk connector health <connector-id> [--json]
soren-sdk catalog snapshot [--database <path>] [--json]
```

Operational boundaries:

- List, get, health, and in-memory snapshot output are read-only
- Only explicit `catalog snapshot --database <path>` writes a local SQLite file
- No connector package, skill, CLI, MCP server, or runtime artifact is executed
- No network access exists
- No package installation exists
- No project mutation exists
- Health is diagnostic, not routing approval

Exit criteria achieved:

- Catalog loading is deterministic
- Legacy connectors are visible but non-selectable
- Missing and malformed manifests cannot silently disappear
- Snapshot IDs are stable across directory order and creation time
- Snapshot IDs change when catalog content changes
- SQLite round trips are covered by integration tests
- Database resources close explicitly
- CLI exit behavior and write boundaries are tested
- Permanent CI runs CLI smoke commands

---

## Phase 3 — Read-only project inspector 🔜

Goal:

Create a content-addressed project snapshot before any SDK selection occurs.

Detect:

- Repository root and revision
- Dirty state
- Package manager and version
- Lockfile and digest
- Workspace graph
- Framework and React versions
- Runtime versions
- Installed dependencies by workspace
- Existing motion, scroll, WebGL, component, and testing tools
- Storybook configuration
- shadcn configuration
- Existing ownership declarations
- Soren SDK config and policies
- Browser and runtime targets

Constraints:

- Strictly read-only
- No dependency installation
- No command execution beyond approved inspector operations
- No network calls
- Explicit path scope
- Stable warnings for incomplete detection
- Identical content produces identical snapshot digest

Exit criteria:

- Clean Next.js fixture passes
- Soren Design System monorepo fixture passes
- Existing animation-heavy React fixture passes
- Snapshot validates against the Phase 1 contract
- Snapshot is content-addressed and reproducible

---

## Phase 4 — First routing vertical slice

Implement only:

1. Web Platform
2. Motion
3. GSAP

Capabilities:

- CSS transitions
- CSS animations
- Web Animations API
- Presence
- Layout
- Gesture and drag
- Timelines
- ScrollTrigger and pinned sequences

Route statuses:

- `native`
- `selected`
- `no-sdk`
- `needs-input`
- `blocked`

Exit criteria:

- Hard-constraint violations: zero
- Forbidden connector selections: zero
- Native solution wins simple cases
- Existing approved dependency is reused
- Motion and GSAP ownership conflicts are rejected
- Route explanation is human-readable
- At least 30 positive, negative, and metamorphic fixtures pass

---

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
- Network access
- Filesystem access
- Remote project content
- Bundle budgets
- Accessibility
- Required approvals

Exit criteria:

- Higher-level denies cannot be weakened
- Same project, catalog, and policy snapshots produce the same route
- Policy decisions appear in evidence
- Lockfile contains no credentials

---

## Phase 6 — Universal protocol surfaces

Implement equivalent operations through:

- CLI
- REST
- MCP
- TypeScript SDK

Add agent capability negotiation rather than hardcoded vendor logic.

Optional setup profiles may support:

- Hermes
- OpenClaw
- OpenCode
- Codex
- Claude Code
- Other compatible clients

Exit criteria:

- Contract tests prove equivalent behavior
- SDK knowledge is not duplicated in agent profiles
- Core contracts require no model ID

---

## Phase 7 — Context broker and tool gateway

Add:

- Progressive connector context
- Agent Skills validation
- Source freshness and digest checks
- MCP protocol negotiation
- Tool inventory and change detection
- Per-run grants
- Read-only tool calls
- Audit events
- Kill switches
- Fallback behavior

Exit criteria:

- Retrieved content cannot grant permissions
- Material tool changes require review
- Remote project-content exposure requires policy and consent
- Registry discovery never equals approval

---

## Phase 8 — Plan and verification

Add:

- Dependency plan
- File-change plan
- Command plan
- Permission plan
- Verification plan
- Evidence envelope generation
- Affected-scope checks
- Screenshot and performance artifacts

Still no automatic apply.

Exit criteria:

- Plans are reviewable and content-addressed
- Evidence distinguishes passed, failed, not-required, and not-run
- Required checks cannot be marked passed without runner evidence

---

## Phase 9 — Approved apply sandbox

Add:

- Branch or worktree isolation
- Exact-plan approval
- Plan-drift detection
- Command allowlist
- Filesystem and network scopes
- Time and resource limits
- Before-state snapshot
- Diff and rollback data
- Post-apply verification

Exit criteria:

- No direct protected-branch writes
- Approval is scoped to one immutable plan
- Failed apply rolls back or explicitly reports rollback failure
- Every mutation is auditable

---

## Phase 10 — Remaining first-wave connectors

Activate in this order:

1. Lenis
2. React Three Fiber
3. Storybook
4. shadcn

Each connector must pass:

- Schema v2 contract tests
- Positive routes
- Negative routes
- Metamorphic routes
- Security review
- Implementation benchmark
- Human quality review

---

## Phase 11 — Soren Design System integration

Reference workflow:

```text
Hermes
→ primary implementation

OpenClaw or another independent reviewer
→ architecture, security, and conflict audit
```

Deliverables:

- Storybook component context
- Private shadcn registry
- Approved motion recipes
- Design-system policy
- Multi-SDK benchmark
- GitHub pull-request workflow

---

## Phase 12 — Control Center

Build only after the core APIs stabilize.

Views:

- Catalog and capability explorer
- Connector blockers and health
- Source freshness
- Integration permissions
- MCP and skill status
- Policy decisions
- Route explanations
- Evaluation results
- Evidence history
- Workspace dependency graph

The UI remains a client of the core.

---

## Phase 13 — Controlled expansion

Potential future connector groups:

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

No connector is added solely because it is popular. It must satisfy a defined capability gap.

---

## Release 0.1 definition of done

Release `0.1` remains read-only and is complete when:

- Contracts validate
- Catalog and SQLite snapshots work
- Project inspection works
- Web Platform, Motion, and GSAP route correctly
- Policy and lockfile work
- CLI, REST, MCP, and TypeScript SDK are contract-equivalent
- Context is selectively loaded
- Tool access is read-only and permissioned
- Verification and evidence work
- Hard safety gates have zero failures
- Multiple agent clients can consume the same route package

Package installation, command execution, and application-source mutation are explicitly out of scope until the apply sandbox is independently reviewed.
