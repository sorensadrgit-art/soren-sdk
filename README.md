# Soren SDK

> Agent-native SDK intelligence, routing, installation, composition, and verification for premium frontend development.

**Repository slug:** `soren-sdk`  
**Project name:** **Soren SDK**  
**Status:** Architecture and implementation blueprint  
**Primary owner:** Soren  
**Intended agents:** Hermes, OpenClaw, OpenCode, Codex, Claude Code, GitHub Copilot, and future coding agents

---

## 1. What Soren SDK is

Soren SDK is a platform that teaches coding agents how to correctly discover, select, combine, install, use, and verify modern frontend SDKs.

It is not another animation library and it is not a package that blindly installs every frontend dependency.

Soren SDK sits between a user request and the application code:

```text
User request
    ↓
Project inspection
    ↓
Capability decomposition
    ↓
SDK routing
    ↓
Compatibility and ownership resolution
    ↓
Relevant documentation, skills, MCP tools, and recipes
    ↓
Runtime dependency planning
    ↓
Implementation
    ↓
SDK-specific verification
    ↓
Evidence report
```

The platform should make an agent better at tasks such as:

- Premium React UI construction
- Cinematic timelines
- Scroll-driven storytelling
- Component and layout animation
- Smooth scrolling
- 3D and WebGL experiences
- Interactive vector animation
- Data visualization
- Accessible component composition
- Storybook documentation
- Browser and performance testing

---

## 2. The problem

Installing an SDK does not teach an agent how to use it well.

An agent may know that Motion, GSAP, Lenis, Three.js, React Three Fiber, Storybook, and shadcn exist, but still:

- Choose the wrong SDK for a behavior
- Use outdated APIs
- Mix animation engines on the same property
- Install unnecessary dependencies
- Put browser-only logic in server code
- Forget cleanup
- Ignore reduced motion
- Generate untested examples
- Break existing design-system conventions
- Load excessive documentation into every prompt
- Claim completion without evidence

Soren SDK solves this by creating a structured connector for every supported SDK.

---

## 3. The product model

Soren SDK contains seven major systems.

### 3.1 SDK Catalog

A machine-readable inventory of supported SDKs, their capabilities, trust level, connection methods, versions, licenses, and project compatibility.

### 3.2 SDK Router

Converts a user request into required capabilities, then selects the smallest correct SDK set.

### 3.3 Connector System

Connects an SDK to agents through one or more methods:

1. Official MCP server
2. Official agent skill
3. Official documentation adapter
4. Soren-authored specialist skill
5. Runtime adapter or package installer

### 3.4 Compatibility Engine

Prevents conflicting SDK combinations and assigns ownership for scrolling, transforms, layout, gestures, rendering, timelines, and other behaviors.

### 3.5 Context Builder

Loads only the documentation, rules, recipes, and examples relevant to the current task.

### 3.6 Verification Engine

Runs SDK-specific static checks, tests, browser checks, accessibility validation, performance audits, and cleanup validation.

### 3.7 Evidence Reporter

Produces a structured record of:

- SDKs selected
- Why each SDK was selected
- Files changed
- Dependencies added
- Tests executed
- Checks passed or failed
- Work that remains unverified

---

## 4. First supported SDK wave

The first implementation wave contains six connectors.

| Connector | Primary use | Preferred agent connection |
|---|---|---|
| Motion | React state, layout, gestures, springs, presence | Official MCP and official skills |
| GSAP | Timelines, ScrollTrigger, sequencing, advanced choreography | Official GSAP skills and official docs |
| Lenis | Smooth-scroll transport and DOM/WebGL synchronization | Soren skill and official docs |
| React Three Fiber | React-based Three.js scenes and render-loop behavior | Soren skill and official docs |
| Storybook | Component context, stories, tests, documentation | Official Storybook MCP |
| shadcn | Registry search, component installation, composition | Official MCP and official skills |

These six connectors create a complete first vertical slice:

- UI components
- UI motion
- Cinematic sequencing
- Scroll transport
- 3D
- Component documentation
- Agent-readable testing
- Private registry installation

---

## 5. Design-system relationship

The existing Soren Design System becomes the first reference workspace for Soren SDK.

```text
Soren SDK
    ├── teaches agents which SDKs to use
    ├── connects agents to trusted knowledge
    ├── prevents conflicts
    ├── installs selected runtime dependencies
    └── verifies implementations

Soren Design System
    ├── supplies tokens and UI standards
    ├── supplies approved components
    ├── supplies motion recipes
    ├── supplies Storybook documentation
    └── proves the SDK platform in production
```

The design system is not discarded. It becomes the premium proving ground and reference implementation.

---

## 6. Core rules

1. **All SDKs are discoverable; only relevant SDKs are activated.**
2. **Official sources take priority over remembered model knowledge.**
3. **Runtime dependencies are installed only in the project that needs them.**
4. **Frontend SDKs are not globally installed into agents.**
5. **One engine owns a property or behavior at a time.**
6. **Every connector must define when not to use its SDK.**
7. **Every generated implementation must include verification appropriate to the SDK.**
8. **Agents may not silently install untrusted global skills.**
9. **The smallest sufficient SDK set is preferred.**
10. **Completion claims require evidence.**

---

## 7. Planned repository structure

```text
soren-sdk/
├── apps/
│   ├── control-center/
│   ├── docs/
│   ├── evaluation-lab/
│   └── playground/
│
├── packages/
│   ├── sdk-catalog/
│   ├── sdk-router/
│   ├── sdk-context-builder/
│   ├── compatibility-engine/
│   ├── project-inspector/
│   ├── dependency-planner/
│   ├── verification-engine/
│   ├── evidence-reporter/
│   └── agent-adapters/
│
├── sdk-connectors/
│   ├── _template/
│   ├── motion/
│   ├── gsap/
│   ├── lenis/
│   ├── react-three-fiber/
│   ├── storybook/
│   └── shadcn/
│
├── evaluations/
├── docs/
├── AGENTS.md
└── README.md
```

This planning package contains the contracts and documents required before implementation begins.

---

## 8. Human workflow

A typical human request may be:

> Create a premium product page with smooth scrolling, pinned cinematic sections, draggable cards, and an interactive 3D product.

Soren SDK should respond internally with:

```text
Capability: smooth-scroll transport
Selected: Lenis

Capability: pinned cinematic choreography
Selected: GSAP + ScrollTrigger

Capability: draggable cards and layout transitions
Selected: Motion

Capability: interactive WebGL product
Selected: React Three Fiber

Capability: existing component reuse and testing
Selected: Storybook MCP + shadcn registry
```

It should then declare ownership:

```text
Lenis owns scroll transport.
GSAP owns pinned section timelines.
Motion owns card gestures and card layout transitions.
React Three Fiber owns objects inside the canvas.
CSS owns simple color and focus transitions.
```

---

## 9. Agent workflow

Every agent task follows this order:

1. Read `AGENTS.md`.
2. Inspect the target repository.
3. Identify requested visual and interaction capabilities.
4. Query the SDK catalog.
5. Select the smallest sufficient SDK set.
6. Run compatibility checks.
7. Load only selected connector context.
8. Plan runtime dependencies.
9. Implement within package boundaries.
10. Execute connector-required verification.
11. Produce an evidence report.

Agents must never skip directly from a request to installing libraries.

---

## 10. Implementation order

### Phase 0 — Foundation

- Approve architecture
- Create monorepo
- Add catalog and connector schemas
- Add agent rules
- Add evaluation format
- Add source trust policy

### Phase 1 — Router prototype

- Project inspector
- Capability taxonomy
- Deterministic SDK selection
- Compatibility rules
- Human-readable selection report

### Phase 2 — First connectors

- Motion
- GSAP
- Lenis
- React Three Fiber
- Storybook
- shadcn

### Phase 3 — Verification

- Static validators
- Browser checks
- Accessibility checks
- Animation ownership checks
- Evidence reports

### Phase 4 — Control Center

- Connected SDK dashboard
- Health status
- Version and documentation freshness
- Connector enable/disable
- Conflict reports
- Evaluation results

### Phase 5 — Design-system integration

- Connect Soren Design System
- Expose Storybook to agents
- Expose private shadcn registry
- Import approved motion recipes
- Run end-to-end benchmarks

---

## 11. Definition of done for the first release

The first release is complete when:

- The catalog can describe the six first-wave SDKs
- A request can be decomposed into capabilities
- The router can select one or more appropriate SDKs
- The compatibility engine can reject known conflicts
- Connector context can be loaded selectively
- Runtime dependencies can be planned without global installation
- At least one benchmark exists per connector
- Verification results are stored in a structured evidence report
- The Soren Design System can consume the platform
- Hermes and at least one second agent can follow the same repository rules

---

## 12. Documents in this package

- [`AGENTS.md`](./AGENTS.md) — mandatory agent behavior
- [`docs/PROJECT-BLUEPRINT.md`](./docs/PROJECT-BLUEPRINT.md) — complete product definition
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — packages, layers, and data flow
- [`docs/SDK-CONNECTOR-STANDARD.md`](./docs/SDK-CONNECTOR-STANDARD.md) — connector contract
- [`docs/FIRST-SDK-WAVE.md`](./docs/FIRST-SDK-WAVE.md) — first six integrations
- [`docs/EVALUATIONS.md`](./docs/EVALUATIONS.md) — benchmark and quality system
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — phased execution plan
- [`docs/GOVERNANCE-SECURITY.md`](./docs/GOVERNANCE-SECURITY.md) — trust, updates, and safety
- [`docs/OFFICIAL-SOURCES.md`](./docs/OFFICIAL-SOURCES.md) — initial authoritative references

---

## 13. Immediate next action

The first engineering milestone is not the Control Center UI.

It is a command-line proof of concept that can:

```bash
soren-sdk inspect
soren-sdk route "Build a cinematic product page..."
soren-sdk explain
soren-sdk verify
```

The router must work reliably before a visual dashboard is built around it.
