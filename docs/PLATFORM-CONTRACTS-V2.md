# Platform Contracts v2

## 1. Purpose

This document defines the target domain model and platform contracts for Soren SDK.

It supersedes any interpretation in which one connector object represents an entire SDK ecosystem.

## 2. Control plane, data plane, and protocol plane

### Control plane

Owns durable administrative state:

- Capability ontology
- SDK product registry
- Integration artifact registry
- Source ingestion and freshness
- Connector review and approval
- Policy management
- Evaluation definitions and results
- Catalog snapshots
- Workspace configuration

### Data plane

Runs a specific request:

- Project inspection
- Request normalization
- Capability resolution
- Candidate selection
- Policy evaluation
- Ownership resolution
- Context assembly
- Tool invocation
- Execution
- Verification
- Evidence recording

### Protocol plane

Exposes the same use cases through:

- CLI
- REST API
- MCP server
- TypeScript SDK

Protocol implementations are adapters over the same application services. They must not contain independent routing logic.

## 3. Core entities

### `Capability`

A stable, provider-independent behavior identifier.

Examples:

```text
platform.css-transition
platform.waapi-animation
motion.presence
motion.layout
motion.timeline
interaction.drag
scroll.smooth-transport
scroll.pinned-sequence
webgl.react-scene
component.registry-install
testing.story-interaction
```

A capability record defines:

- ID
- Family
- Human description
- Inputs and outputs
- Required environment
- Quality dimensions
- Incompatible ownership domains
- Verification expectations
- Native fallback, if any

### `SdkProduct`

Represents a branded product or project.

Examples:

- Motion
- GSAP
- Lenis
- Storybook

An SDK product does not imply an installed package or available MCP server.

### `IntegrationArtifact`

Represents one usable artifact associated with an SDK product.

Kinds include:

- npm package
- CLI
- MCP server
- Agent Skill
- Documentation source
- Runtime adapter
- Validator
- Recipe source

Each artifact has independent version, publisher, license, authentication, permissions, integrity, cost, and lifecycle metadata.

### `CapabilityClaim`

Declares that an artifact or built-in provider can satisfy a capability.

A claim includes:

- Capability ID
- Support level: `primary`, `secondary`, or `fallback`
- Confidence
- Conditions
- Limitations
- Framework and environment constraints
- Quality characteristics
- Required companion artifacts

### `OwnershipClaim`

Declares which behavior or property an implementation owns.

A claim includes:

- Domain
- Scope
- Exclusivity
- Property list
- Lifecycle boundary
- Conflict severity

### `Policy`

Defines allowed and denied behavior.

Policies may govern:

- Allowed SDKs
- Allowed licenses
- Paid services
- Network access
- Filesystem access
- Runtime package mutation
- Remote MCP servers
- Experimental connectors
- Bundle budgets
- Accessibility gates
- Required review
- Approved sources

### `ProjectSnapshot`

A content-addressed, read-only record of the inspected project.

It includes:

- Repository revision
- Package manager and lockfile digest
- Workspace graph
- Framework versions
- Installed dependencies
- Relevant configuration
- Existing ownership declarations
- Policy files
- Browser and runtime targets

### `RoutePlan`

The decision produced by routing.

Statuses:

- `selected`
- `native`
- `no-sdk`
- `needs-input`
- `blocked`

It includes:

- Requested capabilities
- Selected provider claims
- Rejected alternatives
- Hard constraints
- Ownership plan
- Uncertainty
- Required user decisions
- Catalog snapshot ID
- Policy snapshot ID

### `ExecutionPlan`

A reviewable proposal for changes.

It includes:

- Files to create or modify
- Dependencies to add or remove
- Commands to execute
- Network destinations
- Filesystem scopes
- Required credentials by name, never value
- Rollback strategy
- Verification plan
- Approval requirements

### `EvidenceEnvelope`

A fact-based record of the run.

It includes:

- Authenticated principal
- Agent profile and model metadata when available
- Project snapshot
- Catalog and policy snapshots
- Route and execution plans
- Source and artifact digests
- Commands and normalized results
- Verification evidence
- Unverified items
- Resulting revision

It must not contain hidden reasoning, secrets, or unnecessary private source content.

## 4. Trust dimensions

Do not use a single `trust` field.

Use:

### Publisher

Who authored or distributed the connector or artifact.

### Source authority

Values:

- `official`
- `maintainer`
- `soren-approved`
- `community`
- `unknown`

### Integrity level

Values:

- `unverified`
- `url-recorded`
- `version-pinned`
- `commit-pinned`
- `digest-pinned`
- `signed`
- `attested`

### Review status

Values:

- `proposed`
- `experimental`
- `approved`
- `stable`
- `deprecated`
- `retired`
- `blocked`

### Execution risk

Values:

- `none`
- `read-only`
- `project-write`
- `command-execution`
- `network-and-command`
- `privileged`

### Data exposure

Values:

- `none`
- `local-only`
- `remote-metadata`
- `remote-source`
- `remote-project-content`

## 5. Native provider rule

The Web Platform is a built-in provider.

The router must consider:

- CSS transitions and animations
- Web Animations API
- Native scrolling
- HTML semantics
- Browser focus behavior
- Framework-native behavior already present in the project

before adding a third-party SDK.

A `no-sdk` decision is a successful route, not a failure.

## 6. Constraint model

Compatibility is evaluated from claims and policies.

Constraint classes:

- Environment
- Framework
- Version
- Ownership
- License
- Cost
- Permission
- Network
- Bundle
- Performance
- Accessibility
- Security
- Project preference

Pairwise connector relationships may document known combinations but cannot override hard policy constraints.

## 7. Configuration hierarchy

Suggested files:

```text
.soren-sdk/config.yaml
.soren-sdk/policy.yaml
soren-sdk.lock
```

Precedence:

1. Built-in safety policy
2. Organization policy
3. Workspace policy
4. Project policy
5. Per-run preferences

Lower levels may tighten constraints but may not weaken higher-level denies.

## 8. Lockfile

`soren-sdk.lock` makes routing reproducible.

It records:

- Catalog snapshot digest
- Capability ontology version
- Connector versions
- Integration artifact versions and digests
- Documentation source versions and digests
- Skill commit hashes
- MCP protocol version and extension set
- Policy snapshot digest
- Resolved runtime versions
- Generated-at timestamp

The lockfile contains no credentials.

## 9. Universal operation contract

The following operations must exist once the applicable phase is implemented:

```text
inspect
catalog.list
catalog.get
route
explain
plan
apply
verify
report
connector.health
evaluation.run
```

CLI, REST, MCP, and TypeScript SDK expose the same operation semantics and schemas.

## 10. Agent capability negotiation

An agent session declares:

- Supported protocol surfaces
- Supported MCP protocol versions
- Skill format support
- Context budget
- Tool-call support
- File and command capabilities
- Interactive approval support

Core routing does not hardcode agent names or model IDs.

Optional profiles may provide installation instructions for Hermes, OpenClaw, OpenCode, Codex, Claude Code, and other clients.

## 11. Execution contract

Default mode is `plan`.

`apply` requires:

- Explicit approval
- Branch or worktree isolation
- Scoped filesystem grants
- Scoped network grants
- Command allowlist
- Timeout and resource limits
- Before-state snapshot
- Lockfile preservation
- Diff generation
- Rollback data
- Post-apply verification

No connector may silently move a run from `plan` to `apply`.

## 12. Storage

Use a storage adapter interface.

Initial default:

- SQLite
- Local-first
- Single-user friendly
- Easy backup and inspection

Future option:

- PostgreSQL for shared or hosted deployments

Stored data:

- Catalog snapshots
- Policies and approvals
- Connector health
- Evaluations
- Evidence
- Audit events

Secrets remain outside normal application storage.

## 13. Observability

Use privacy-safe OpenTelemetry instrumentation for:

- Inspection
- Routing
- Policy evaluation
- Context retrieval
- Tool invocation
- Execution
- Verification

Do not record prompts, source files, tokens, or tool output bodies by default.

## 14. MVP package topology

Avoid premature micro-packages.

Start with:

```text
packages/
├── contracts/
├── core/
├── connectors/
├── cli/
├── protocol-server/
└── testing/
```

Inside `core`, keep modules clearly separated:

```text
core/src/
├── capabilities/
├── catalog/
├── inspector/
├── policy/
├── router/
├── compatibility/
├── context/
├── execution/
├── verification/
├── evidence/
├── storage/
└── observability/
```

Extract a module into its own package only when release cadence, dependency boundaries, or ownership justify the split.
