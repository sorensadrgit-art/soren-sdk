# Soren SDK Roadmap

The roadmap prioritizes a trustworthy core before a polished dashboard.

## Phase 0 — Repository foundation

### Goal

Create a stable place for humans and agents to collaborate.

### Deliverables

- pnpm/Turborepo workspace
- TypeScript configuration
- Root AGENTS.md
- Contributor documentation
- Contracts package
- Connector schema
- Evidence schema
- ADR template
- Pull request template
- CI for schema, lint, type check, and tests

### Exit criteria

- A sample connector validates
- Invalid connectors fail CI
- Human and agent instructions agree
- No runtime SDK integration is required yet

---

## Phase 1 — Catalog and connector loader

### Goal

Load and query structured SDK metadata.

### Deliverables

- `@soren-sdk/contracts`
- `@soren-sdk/sdk-catalog`
- Manifest validation
- Connector discovery
- Alias resolution
- Status and trust filtering
- CLI catalog commands

### Exit criteria

```bash
soren-sdk catalog list
soren-sdk connector show motion
```

work against the first six connector manifests.

---

## Phase 2 — Project inspector

### Goal

Understand the target project before routing.

### Deliverables

- package manager detection
- workspace detection
- framework detection
- installed dependency detection
- Storybook detection
- shadcn configuration detection
- animation and scroll dependency detection
- read-only JSON report

### Exit criteria

The inspector correctly reads at least three fixture projects:

- Clean Next.js app
- Soren Design System monorepo
- Existing animation-heavy React app

---

## Phase 3 — Capability router

### Goal

Select SDKs based on requested behavior.

### Deliverables

- Capability taxonomy
- Request normalization
- Candidate retrieval
- Deterministic scoring
- Set minimization
- Human-readable explanation
- Positive and negative route tests

### Exit criteria

At least 90% of approved first-wave route fixtures select the expected SDK set with no forbidden connectors.

---

## Phase 4 — Compatibility and ownership

### Goal

Safely combine selected SDKs.

### Deliverables

- Relationship schema
- Ownership domains
- Conflict detection
- Resolution suggestions
- Adapter-required state
- Motion/GSAP conflict rules
- Lenis transport rules
- R3F boundary rules

### Exit criteria

Known conflicts are rejected before dependency planning.

---

## Phase 5 — Context builder and agent adapters

### Goal

Give each agent the smallest correct knowledge set.

### Deliverables

- Connector section retrieval
- Recipe retrieval
- Context budgeting
- Hermes adapter
- OpenClaw adapter
- OpenCode adapter
- Generic Markdown adapter
- Source traceability

### Exit criteria

Two different agents can consume the same route decision without duplicating connector knowledge.

---

## Phase 6 — First connector implementations

### Motion

- Official MCP configuration metadata
- Official skill source metadata
- Context fallback
- Motion-specific validators
- First recipes
- Evaluation fixtures

### GSAP

- Official skill integration
- Timeline and ScrollTrigger recipes
- Cleanup validator
- Ownership rules
- Evaluation fixtures

### Lenis

- Soren skill
- Official docs adapter
- Provider recipe
- Duplicate-instance validator
- Evaluation fixtures

### React Three Fiber

- Soren skill
- Scene shell recipe
- DPR and fallback validators
- Evaluation fixtures

### Storybook

- MCP setup
- Agent manifest validation
- Interaction test integration
- Evaluation fixtures

### shadcn

- MCP setup
- Private registry configuration
- Fixture installation tests
- Evaluation fixtures

### Exit criteria

Each connector has one successful positive benchmark and one successful negative benchmark.

---

## Phase 7 — Verification and evidence

### Goal

Prove generated work.

### Deliverables

- Verification planner
- Check runners
- Affected-scope logic
- Structured evidence JSON
- Markdown report
- Failure normalization
- Screenshot and performance artifact support

### Exit criteria

A multi-SDK benchmark generates complete evidence without claiming unrun checks passed.

---

## Phase 8 — Soren Design System integration

### Goal

Use Soren SDK in a real premium workspace.

### Deliverables

- Storybook exposed to agents
- Private shadcn registry exposed
- Design-system package rules
- Approved component recipes
- Approved motion recipes
- Full composition benchmark
- GitHub pull-request workflow

### Exit criteria

Hermes can implement a design-system task using routed SDK context, and a second agent can independently review it using the same evidence.

---

## Phase 9 — Control Center

### Goal

Provide a visual management interface.

### Deliverables

- SDK catalog dashboard
- Connector health
- Version and source freshness
- MCP and skill status
- Compatibility explorer
- Evaluation scores
- Evidence history
- Workspace dependency view

### Exit criteria

The dashboard reads core package data and does not contain duplicated routing logic.

---

## Phase 10 — Expansion

Add connectors in controlled waves.

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

Every new connector must pass the connector acceptance criteria.

---

## Recommended first GitHub milestones

### Milestone 1 — Contracts

Issues:

- Create monorepo
- Create connector schema
- Create evidence schema
- Create sample Motion manifest
- Add schema CI

### Milestone 2 — Read-only intelligence

Issues:

- Catalog loader
- Project inspector
- Capability taxonomy
- Route explanation

### Milestone 3 — First routing

Issues:

- Motion routing
- GSAP routing
- Lenis routing
- R3F routing
- Storybook routing
- shadcn routing
- Negative route cases

### Milestone 4 — Composition safety

Issues:

- Ownership model
- Compatibility matrix
- Conflict reports
- Multi-SDK route benchmark

### Milestone 5 — Agent integration

Issues:

- Hermes adapter
- OpenClaw adapter
- Generic skill output
- MCP configuration output
- Evidence report

---

## Scope discipline

Do not begin with:

- A large Control Center
- Dozens of connectors
- Automatic package mutation
- Automatic global skill installation
- Public registry publishing
- Complex machine learning for selection

Begin with deterministic, inspectable rules and six excellent connectors.
