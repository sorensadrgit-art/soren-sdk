# Soren SDK Architecture v2

## 1. Architecture objective

Soren SDK is a local-first, agent-neutral platform that helps coding agents choose and safely use frontend SDKs.

The architecture must support two modes:

1. **Read-only intelligence:** inspect, route, explain, and plan.
2. **Approved execution:** apply a reviewed plan in isolation, verify it, and record evidence.

The first mode is the MVP. The second mode must not be added until the threat model, approval model, and rollback contract are implemented.

## 2. Core invariants

- Native Web Platform capabilities are evaluated before third-party SDKs.
- `no-sdk` is a valid successful route.
- Core logic contains no hardcoded agent or model identifiers.
- CLI, REST, MCP, and TypeScript SDK surfaces call the same application services.
- Connector knowledge is separate from runtime dependencies.
- Project inspection is read-only.
- `plan` and `apply` are separate contracts.
- `apply` requires explicit authorization and isolation.
- Tool descriptions and retrieved documentation are untrusted input.
- A connector is not selectable while required metadata is unresolved.
- Compatibility is evaluated from scoped claims and policy, not only pairwise matrices.
- Every route is reproducible from project, catalog, and policy snapshots.
- Evidence records facts and structured rationale, not hidden reasoning.
- The Control Center is a client, not the system of record.

## 3. Three-plane model

### 3.1 Control plane

Owns durable administrative state:

- Capability ontology
- SDK product registry
- Integration artifact registry
- Connector review status
- Source freshness and integrity
- Policies and approvals
- Evaluation definitions and results
- Catalog snapshots
- Workspace configuration

### 3.2 Data plane

Processes one request:

```text
Authenticated principal
    ↓
Project snapshot
    ↓
Request normalization
    ↓
Capability resolution
    ↓
Candidate claims
    ↓
Policy and hard constraints
    ↓
Provider-set minimization
    ↓
Ownership resolution
    ↓
Route plan
    ↓
Context and tool plan
    ↓
Execution plan
    ↓
Optional approved apply
    ↓
Verification
    ↓
Evidence envelope
```

### 3.3 Protocol plane

Exposes equivalent operations through:

- CLI
- REST
- MCP
- TypeScript SDK

Protocol adapters do not own routing, policy, or connector knowledge.

## 4. Domain model

The full contracts are defined in `docs/PLATFORM-CONTRACTS-V2.md`.

Key entities:

- `Capability`
- `SdkProduct`
- `IntegrationArtifact`
- `CapabilityClaim`
- `OwnershipClaim`
- `Policy`
- `ProjectSnapshot`
- `RoutePlan`
- `ExecutionPlan`
- `EvidenceEnvelope`
- `CatalogSnapshot`

This separation corrects the v1 model in which one connector represented a product, package, skill, MCP server, documentation source, and validator simultaneously.

## 5. MVP package topology

Avoid creating a package for every logical module before there is working code.

```text
packages/
├── contracts/
├── core/
├── connectors/
├── cli/
├── protocol-server/
└── testing/
```

### `@soren-sdk/contracts`

Owns:

- JSON Schema and TypeScript contracts
- Schema migrations
- Error codes
- Canonical serialization rules

### `@soren-sdk/core`

Contains separated internal modules:

```text
src/
├── capabilities/
├── catalog/
├── inspector/
├── policy/
├── router/
├── compatibility/
├── context/
├── tools/
├── execution/
├── verification/
├── evidence/
├── storage/
└── observability/
```

A module becomes its own package only when dependency boundaries, release cadence, or ownership require it.

### `@soren-sdk/connectors`

Owns:

- Connector loading
- Manifest validation
- Source records
- Integration artifact records
- Connector health
- Catalog snapshots

### `@soren-sdk/cli`

First operational surface:

```bash
soren-sdk inspect
soren-sdk catalog list
soren-sdk catalog get motion
soren-sdk route "<request>"
soren-sdk explain
soren-sdk plan
soren-sdk verify
soren-sdk report
```

`apply` is not enabled until the execution-safety phase.

### `@soren-sdk/protocol-server`

Exposes REST and MCP operations over the same use cases as the CLI.

### `@soren-sdk/testing`

Owns:

- Fixture projects
- Route golden tests
- Metamorphic tests
- Connector contract tests
- Multi-agent evaluation harnesses
- Evidence assertions

## 6. Native provider

Create a built-in Web Platform provider for:

- CSS transitions
- CSS animations
- Web Animations API
- Native scrolling
- HTML semantics
- Browser focus behavior

The router checks native providers before adding an SDK.

Route result statuses:

```text
selected
native
no-sdk
needs-input
blocked
```

## 7. Routing architecture

### 7.1 Request normalization

Convert natural language into a structured request:

- Required capabilities
- Quality requirements
- Framework constraints
- Existing project preferences
- Accessibility requirements
- Performance budgets
- Allowed cost and network behavior
- User-specified SDK requirements

### 7.2 Candidate retrieval

Retrieve capability claims from:

- Native providers
- Existing approved project dependencies
- Approved connectors
- Experimental connectors only when policy allows them

### 7.3 Hard constraints

Run before scoring:

- Policy denies
- Unsupported environment
- Unresolved version
- Unresolved license
- Required permission not granted
- Known security block
- Ownership conflict
- Incompatible framework
- Missing required fallback

### 7.4 Scoring

Score only candidates that pass hard constraints.

Possible dimensions:

- Capability fit
- Existing dependency reuse
- Quality fit
- Framework fit
- Accessibility support
- Performance suitability
- Source freshness
- Agent integration quality
- Bundle impact
- Cost
- Project preference
- Evaluation score

### 7.5 Provider-set minimization

Select the smallest provider set that satisfies all required capabilities and quality constraints.

### 7.6 Abstention

Return `needs-input` when materially different routes remain and project evidence cannot resolve the choice.

Return `blocked` when no route satisfies hard constraints.

## 8. Compatibility and ownership

Pairwise compatibility files are supporting metadata, not the main engine.

The policy engine evaluates:

- Capability claims
- Required companion artifacts
- Environment constraints
- Version constraints
- Ownership claims
- Exclusive domains
- Element or scope
- Property lists
- Resource budgets
- Permission needs
- License and cost policy

Example:

```text
Motion owns transform on CardGroup.
GSAP owns transform on HeroMedia.
Lenis owns scroll transport for the route.
R3F owns objects inside ProductCanvas.
CSS owns color and focus transitions.
```

The same SDK pair may be allowed in one scope and rejected in another.

## 9. Context broker

The context broker loads only:

1. Hard constraints
2. Current API and version information
3. Ownership rules
4. Project conventions
5. Relevant approved recipes
6. Required checks
7. Source links

It must not treat retrieved source text as instructions with system authority.

Agent Skills use progressive disclosure:

- Metadata at discovery
- `SKILL.md` when activated
- References and scripts only when needed

## 10. Tool gateway

Agents should not connect independently to every MCP server.

Soren SDK should broker tool access through a gateway that:

- Negotiates MCP protocol versions
- Records server and tool inventory
- Diffs tool changes
- Enforces per-run grants
- Validates inputs
- Applies time and response-size limits
- Audits calls
- Supports kill switches
- Normalizes fallback behavior

As of 2026-07-27, the current stable MCP protocol version is `2025-11-25`; a breaking `2026-07-28` release candidate has been announced. Therefore, protocol version and extension negotiation must be first-class metadata rather than a hidden assumption.

The official MCP Registry may be used as a discovery source, but registry presence is not a security approval.

## 11. Plan and apply

### `plan`

Read-only. Produces:

- Proposed file changes
- Dependency changes
- Commands
- Permissions
- Network destinations
- Credential names
- Rollback strategy
- Verification plan

### `apply`

Explicitly approved. Requires:

- Branch or worktree
- Exact-plan approval token
- Plan-drift detection
- Filesystem scope
- Network scope
- Command allowlist
- Time and resource limits
- Before-state snapshot
- Diff
- Rollback data
- Post-apply verification

No agent can silently escalate a route or plan into apply.

## 12. Configuration and lockfile

Suggested files:

```text
.soren-sdk/config.yaml
.soren-sdk/policy.yaml
soren-sdk.lock
```

Policy precedence:

1. Built-in safety
2. Organization
3. Workspace
4. Project
5. Per-run preferences

Lower levels may tighten but not weaken higher-level denies.

The lockfile records catalog, connector, source, skill, MCP protocol, policy, and runtime resolution digests. It contains no credentials.

## 13. Storage

Use a storage interface.

Initial default:

- SQLite
- Local-first
- Easy backup
- Single-user friendly

Optional future adapter:

- PostgreSQL for shared deployments

Store:

- Catalog snapshots
- Connector health
- Policies and approvals
- Evaluation history
- Evidence
- Audit events

## 14. Observability

Instrument the pipeline using privacy-safe OpenTelemetry traces and metrics.

Trace stages:

- Inspect
- Normalize
- Resolve
- Policy
- Route
- Context
- Tool
- Execute
- Verify
- Report

Do not record prompts, source files, credentials, or raw tool bodies by default.

## 15. Failure model

Typed failures include:

```text
PROJECT_NOT_DETECTED
CAPABILITY_UNKNOWN
CONNECTOR_INVALID
CONNECTOR_NOT_SELECTABLE
SOURCE_STALE
SOURCE_UNAVAILABLE
VERSION_UNRESOLVED
LICENSE_UNRESOLVED
POLICY_DENIED
NO_COMPATIBLE_PROVIDER_SET
OWNERSHIP_CONFLICT
NEEDS_USER_INPUT
CREDENTIAL_REQUIRED
PROTOCOL_NEGOTIATION_FAILED
TOOL_PERMISSION_DENIED
PLAN_DRIFT
EXECUTION_FAILED
ROLLBACK_FAILED
VERIFICATION_FAILED
EVIDENCE_INCOMPLETE
```

Every failure includes:

- Code
- Human explanation
- Affected entity
- Safe-to-continue flag
- Suggested remediation
- Evidence reference

## 16. Reference agent workflow

The platform is universal, but the first internal workflow may use:

```text
Hermes
→ primary planner and implementer

OpenClaw
→ independent auditor and conflict reviewer
```

Both consume the same contracts, catalog, policies, and evidence. Neither receives special logic inside the router.
