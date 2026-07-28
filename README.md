# Soren SDK

> Agent-native SDK intelligence, policy, routing, tool brokering, execution planning, and verification for premium frontend development.

**Repository slug:** `soren-sdk`  
**Project name:** **Soren SDK**  
**Status:** Architecture hardening and contract design  
**Primary owner:** Soren  
**Reference agents:** Hermes as primary implementer; OpenClaw as independent auditor  
**Platform goal:** Universal agent support through CLI, REST, MCP, and TypeScript SDK parity

## What Soren SDK is

Soren SDK helps coding agents correctly discover, select, combine, and verify modern frontend SDKs.

It is not another animation library and it does not install every frontend dependency.

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

## Architecture hardening v2

A critical review on 2026-07-27 identified foundational improvements required before implementation:

- Separate SDK products from packages, MCP servers, skills, documentation, and validators
- Separate connector publisher from source authority
- Add a built-in Web Platform provider so CSS, WAAPI, or no SDK can win
- Replace pairwise-only compatibility with scoped claims and policy constraints
- Make CLI, REST, MCP, and TypeScript SDK surfaces behaviorally equivalent
- Remove hardcoded agent and model identity from core contracts
- Add local-first storage, policy files, and `soren-sdk.lock`
- Add explicit `plan` and sandboxed `apply` contracts
- Treat documentation and tool descriptions as untrusted input
- Add protocol negotiation, consent, provenance, license, and hard evaluation gates

Read:

- [`docs/ARCHITECTURE-REVIEW-2026-07-27.md`](./docs/ARCHITECTURE-REVIEW-2026-07-27.md)
- [`docs/PLATFORM-CONTRACTS-V2.md`](./docs/PLATFORM-CONTRACTS-V2.md)
- [`docs/THREAT-MODEL.md`](./docs/THREAT-MODEL.md)

## Core product systems

### Capability ontology

Defines provider-independent behaviors such as:

- `platform.css-transition`
- `motion.layout`
- `motion.timeline`
- `scroll.smooth-transport`
- `webgl.react-scene`
- `registry.install`

### Connector catalog

Stores Soren-authored connector packages and their independent integration artifacts:

- Runtime package
- MCP server
- Agent Skill
- Documentation source
- CLI
- Validator
- Recipe source

### Policy engine

Enforces:

- Allowed SDKs
- Licenses
- Versions
- Paid services
- Network and filesystem access
- Experimental status
- Bundle and performance budgets
- Accessibility requirements
- Approval requirements

### Router

Selects the smallest provider set that satisfies capabilities and policy.

Valid outcomes:

- `native`
- `selected`
- `no-sdk`
- `needs-input`
- `blocked`

### Context broker and tool gateway

Loads only relevant knowledge and brokers MCP or other tool access through explicit permissions, version negotiation, inventory checks, and audit events.

### Plan and apply

`plan` is read-only.

`apply` is a later, explicitly approved operation requiring isolation, scoped permissions, drift detection, rollback data, diff review, and verification.

### Verification and evidence

Records factual results tied to:

- Project snapshot
- Catalog snapshot
- Policy snapshot
- Route plan
- Execution plan
- Check-run output
- Resulting revision

Evidence never includes hidden reasoning or credential values.

## First implementation vertical slice

Do not start with all SDKs.

Prove the architecture using:

1. Web Platform
2. Motion
3. GSAP

This slice must correctly determine:

- When CSS is enough
- When WAAPI is enough
- When Motion is correct
- When GSAP is correct
- When Motion and GSAP may coexist
- When the route needs user input
- When policy blocks a route

After the slice passes, activate:

4. Lenis
5. React Three Fiber
6. Storybook
7. shadcn

## Current connector status

The existing first-wave manifests are planning artifacts. They must migrate to Connector Schema v2 and remain non-selectable until versions, licenses, related files, permissions, compatibility, and evaluations resolve.

The connector standard lives at:

- [`docs/SDK-CONNECTOR-STANDARD.md`](./docs/SDK-CONNECTOR-STANDARD.md)
- [`schemas/connector.schema.json`](./schemas/connector.schema.json)
- [`capabilities/catalog.json`](./capabilities/catalog.json)

## Target repository structure

```text
soren-sdk/
├── packages/
│   ├── contracts/
│   ├── core/
│   ├── connectors/
│   ├── cli/
│   ├── protocol-server/
│   └── testing/
│
├── sdk-connectors/
├── capabilities/
├── schemas/
├── evaluations/
├── apps/
│   ├── control-center/
│   ├── docs/
│   ├── evaluation-lab/
│   └── playground/
├── docs/
├── AGENTS.md
└── README.md
```

The compact package topology avoids premature micro-package fragmentation. Logical modules may split later when release cadence, dependencies, or ownership justify it.

## Universal interfaces

The same application services must power:

```text
CLI
REST
MCP
TypeScript SDK
```

Target operations:

```bash
soren-sdk inspect
soren-sdk catalog list
soren-sdk catalog get motion
soren-sdk connector health motion
soren-sdk route "Build a cinematic product page"
soren-sdk explain
soren-sdk plan
soren-sdk verify
soren-sdk report
```

`apply` remains disabled until the execution-safety phase is complete.

## Security position

- Public source and tool metadata are untrusted input
- Runtime packages are installed only in target workspaces
- No silent global skill installation
- No hardcoded credentials, agents, or model IDs
- Remote MCP servers require policy approval
- Mutating tools require explicit consent
- No token passthrough
- Local MCP commands require review and sandboxing
- Project inspection is read-only
- Protected branches are changed through pull requests
- Releases require complete evidence

See:

- [`SECURITY.md`](./SECURITY.md)
- [`docs/GOVERNANCE-SECURITY.md`](./docs/GOVERNANCE-SECURITY.md)
- [`docs/LICENSE-POLICY.md`](./docs/LICENSE-POLICY.md)

## Roadmap

The authoritative execution order is:

1. Architecture hardening
2. Contract implementation
3. Compact core and CLI
4. Project inspector
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

## Current definition of done

The planning stage is complete when:

- Architecture v2 is accepted
- Connector Schema v2 is accepted
- Capability ontology is accepted
- Threat model is accepted
- Existing manifests are explicitly non-selectable pending migration
- Issue #1 reflects the v2 execution sequence

The first software release, `0.1`, is read-only. Package mutation and command execution are out of scope until the apply sandbox is independently reviewed.
