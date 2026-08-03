# Phase 4 Native-First Router Design

**Date:** 2026-07-30  
**Status:** Proposed for implementation  
**Issue:** #9  
**Branch:** `feat/router-vertical-slice-v1`

## 1. Purpose

Phase 4 adds Soren SDK's first deterministic capability router.

The router accepts already-structured capability requests and produces a contract-valid, content-addressed `RoutePlan` using only:

1. Web Platform
2. Motion
3. GSAP

It does not interpret natural-language requests, install packages, generate code, invoke MCP servers or Agent Skills, access the network, execute commands, or modify projects.

## 2. Approved design direction

### Selected approach: deterministic constrained set-cover router

The router will:

1. Build provider candidates from healthy Connector Manifest v2 capability claims.
2. Apply hard policy, environment, artifact, provider-limit, and ownership constraints.
3. Enumerate the small provider-set search space.
4. Retain only sets that fully cover required capabilities.
5. Rank valid sets with a deterministic comparison vector.
6. Return `needs-input` instead of using an arbitrary tiebreaker when equally valid sets imply materially different architectures.

This approach is selected because the Phase 4 provider set is intentionally small, all decisions remain inspectable, and every output can be reproduced without an opaque model decision.

### Rejected approach A: hardcoded request decision table

A decision table would be easy for the first dozen cases but would duplicate connector capability data and become brittle as connectors expand.

### Rejected approach B: generic optimization solver

A generic SAT or integer-programming solver is unnecessary for three providers and would make explanations and debugging harder. The router may adopt a formal solver later if the catalog size and constraint model justify it.

## 3. Current official source baseline

### Motion

Reviewed on 2026-07-30:

- Runtime package: `motion`
- Current npm version: `12.42.2`
- React import: `motion/react`
- React prerequisite: `18.2` or newer
- License: MIT
- Current official docs and package describe presence, layout, gestures, drag, springs, scroll-linked effects, and timelines

Official sources:

- https://motion.dev/docs/react-installation
- https://motion.dev/docs/react
- https://motion.dev/docs/ai-kit-install
- https://www.npmjs.com/package/motion
- https://github.com/motiondivision/motion

### GSAP

Reviewed on 2026-07-30:

- Runtime package: `gsap`
- Current npm version: `3.15.0`
- Typical core import: `gsap`
- ScrollTrigger import: `gsap/ScrollTrigger`
- Framework agnostic
- License: GreenSock standard no-charge license, represented internally as `LicenseRef-GSAP-Standard`
- Plugins must be registered before use where applicable

Official sources:

- https://gsap.com/docs/v3/Installation/
- https://gsap.com/docs/v3/GSAP/
- https://gsap.com/docs/v3/Plugins/
- https://www.npmjs.com/package/gsap
- https://github.com/greensock/GSAP
- https://github.com/greensock/gsap-skills

## 4. Scope and non-goals

### In scope

- Web Platform connector completion for routing
- Motion Connector Manifest v2 migration
- GSAP Connector Manifest v2 migration
- Focused connector skills, source records, compatibility rules, and route evaluations
- Built-in Phase 4 read-only policy
- Provider-neutral router service
- Deterministic Route Plan generation
- Explicit-capability CLI route command
- Positive, negative, composition, and metamorphic evaluation fixtures

### Out of scope

- Natural-language capability extraction
- Project or organization policy-file hierarchy
- `soren-sdk.lock` generation
- Code generation
- Dependency installation
- MCP or Agent Skill execution
- External documentation retrieval at route time
- Lenis, React Three Fiber, Storybook, or shadcn routing
- Project mutation
- Control Center UI

## 5. Connector readiness

The router may consider only connectors that are:

- Connector Schema v2
- `approved` or `stable`
- `selectable: true`
- Free of blockers
- Healthy according to the existing catalog health evaluator
- Allowed by the active policy

Legacy, proposed, experimental, blocked, unhealthy, and non-selectable connectors are excluded before provider-set generation.

### Required connector files

Each Phase 4 connector contains:

```text
sdk-connectors/<provider>/
├── sdk.manifest.json
├── SKILL.md
├── docs.sources.json
├── compatibility.json
└── evaluations/
```

The manifest's `relatedFiles` entries are all marked `present` only after the files exist and their focused checks pass.

### Integration-artifact rule

Capability selection is separate from tool selection.

The Phase 4 router requires only the runtime artifact needed to implement a capability. Documentation, MCP, and skill artifacts are recorded but are not invoked. Paid or authenticated artifacts cannot become hidden companions of a selected route.

## 6. Capability surface

### Web Platform

- `platform.css-transition`
- `platform.css-animation`
- `platform.waapi-animation`

### Motion

- `motion.presence`
- `motion.layout`
- `motion.shared-layout`
- `motion.spring`
- `interaction.drag`
- `interaction.gesture`

### GSAP

- `motion.timeline`
- `motion.svg`
- `motion.flip`
- `scroll.triggered-animation`
- `scroll.pinned-sequence`

Generic aliases such as `animation`, `motion`, or `scroll-animation` are not accepted.

## 7. Architecture

Phase 4 remains inside the compact package topology.

```text
packages/core/src/router/
├── types.ts
├── policy.ts
├── candidates.ts
├── constraints.ts
├── ownership.ts
├── rank.ts
├── explain.ts
└── route-capabilities.ts
```

Only the provider-neutral entry point and stable types are exported from `@soren-sdk/core`.

### Public API

```ts
export interface RouteInput {
  request: RouteRequest;
  project: ProjectSnapshot;
  catalog: CatalogReader;
  policy?: PolicyDocument;
  createdAt?: string;
}

export function routeCapabilities(input: RouteInput): RoutePlan;
```

The router has no agent, model, prompt, filesystem, network, or execution dependency.

## 8. Built-in policy

Phase 4 uses one immutable built-in policy when callers do not supply a policy.

```text
policyId: phase-4-read-only
version: 1.0.0
scope: builtin
allowedConnectors: web-platform, motion, gsap
allowExperimental: false
allowedLicenses: MIT, LicenseRef-GSAP-Standard, not-applicable
allowPaidServices: false
network: deny
filesystem read: project
filesystem write: none
allowRemoteProjectContent: false
requireReducedMotion: true
requiredApprovals: none
```

`policySnapshotId` is `digestJson(policyDocument)`.

A caller-supplied policy must validate against the Policy contract and may tighten the built-in policy but may not weaken it. Phase 4 supports only the fields required for provider allow/deny, experimental status, paid services, licenses, reduced motion, and provider permissions. Full policy precedence remains Phase 5.

## 9. Input validation

The router validates:

- `RouteRequest`
- `ProjectSnapshot`
- Active policy
- Final catalog snapshot

It also confirms:

- `request.projectSnapshotId === project.snapshotId`
- Capability IDs exist in the capability ontology
- Required and optional entries do not duplicate the same capability with contradictory flags
- Provider preferences reference known provider IDs or remain explicit rejected preferences
- `maxProviders` is non-negative

The router never repairs invalid input silently.

## 10. Candidate construction

For each requested capability, the router retrieves claims from healthy allowed v2 connectors.

Each candidate records:

- Provider ID
- Capability ID
- Support level
- Confidence
- Required runtime integration IDs
- Runtime package and license
- Environment requirements
- Native or third-party status
- Installed-dependency evidence
- Preference rank
- Ownership template

### Existing dependency detection

The project dependency inventory recognizes:

- `motion` as installed Motion
- `gsap` as installed GSAP
- `framer-motion` as a legacy alias signal, not as installed `motion`

A legacy alias never satisfies a required runtime-artifact check. It may add a deterministic warning or rejected-provider explanation recommending migration later.

## 11. Environment constraints

Motion's React-specific claims require a detected React version compatible with `18.2` or newer.

The first implementation supports conservative parsing of common project declarations:

- Exact versions such as `19.2.0`
- Major or major/minor forms such as `19` or `19.2`
- Caret and tilde ranges
- `>=` lower bounds
- Workspace or npm aliases after their prefixes are removed

When a React declaration cannot be evaluated safely, a required React-specific Motion claim is blocked with `ENVIRONMENT_UNSUPPORTED`; the router does not guess.

GSAP claims are framework agnostic in this slice.

## 12. Provider-set search

The router builds all subsets of eligible third-party providers up to `maxProviders`.

Native Web Platform coverage does not consume a third-party provider slot and is not listed in `selectedProviders`.

For every subset:

1. Add available native claims.
2. Determine the best claim for each requested capability.
3. Reject the set if a required capability remains uncovered.
4. Evaluate policy and artifact constraints.
5. Build ownership assignments.
6. Reject or defer unsafe ownership combinations.
7. Produce a ranking vector.

The provider search is sorted by provider ID before enumeration, making catalog enumeration order irrelevant.

## 13. Ranking and minimization

Valid routes are compared in this order:

1. Fewer selected third-party providers
2. More native coverage
3. More already-installed selected providers
4. Better explicit preferred-provider rank
5. More primary claims, then secondary, then fallback
6. Higher total claim confidence
7. Stable provider-ID ordering only when routes are behaviorally equivalent

If two top routes remain equal before the final stable-ID tiebreaker and would produce materially different provider ownership, the result is `needs-input` with `MATERIAL_TIE`.

The final provider-ID tiebreaker is used only for semantically equivalent routes, never to hide an architectural choice.

## 14. Ownership model

Every covered capability generates an ownership assignment.

Default capability ownership:

| Capability | Domain | Default property |
|---|---|---|
| `platform.css-transition` | `dom-style` | capability-specific style |
| `platform.css-animation` | `dom-animation` | capability-specific animation |
| `platform.waapi-animation` | `dom-animation` | capability-specific animation |
| `motion.presence` | `presence` | `presence` |
| `motion.layout` | `layout` | `layout` |
| `motion.shared-layout` | `layout` | `layout` |
| `motion.spring` | `timing` | `timing` |
| `interaction.drag` | `gesture` | `drag` |
| `interaction.gesture` | `gesture` | `gesture` |
| `motion.timeline` | `timeline` | capability-specific timeline |
| `motion.svg` | `svg-animation` | `svg` |
| `motion.flip` | `layout` | `layout` |
| `scroll.triggered-animation` | `scroll-trigger` | `scroll` |
| `scroll.pinned-sequence` | `scroll-trigger` | `scroll` |

`quality.scope` and `quality.property` override the defaults when supplied.

### Conflict outcome

Return `blocked` with `OWNERSHIP_CONFLICT` when different providers would exclusively own the same explicit scope and property.

### Ambiguity outcome

Return `needs-input` when different providers target the same explicit scope, one or more properties are omitted, and the providers' ownership templates can overlap on DOM transform/layout animation. Required input identifies the missing property or scope detail.

Missing scope/property values otherwise receive capability-specific defaults so the router does not invent conflicts across unrelated capabilities.

## 15. Route outcomes

### `native`

All required capabilities are covered by Web Platform claims. `selectedProviders` is empty.

Native ownership entries and `NATIVE_CAPABILITY_MATCH` constraints explain the decision.

### `selected`

At least one third-party provider is required. `selectedProviders` contains only Motion and/or GSAP; native coverage remains represented in ownership and constraints.

### `no-sdk`

No required capability needs a provider and unsupported optional capabilities may be omitted.

### `needs-input`

A material architectural tie or ownership ambiguity cannot be resolved safely from the supplied structured input.

### `blocked`

A required capability, policy, environment, provider-limit, runtime-artifact, or ownership constraint fails.

## 16. Stable explanation codes

Required codes:

```text
NATIVE_CAPABILITY_MATCH
CAPABILITY_MATCH
EXISTING_DEPENDENCY_REUSE
LEGACY_ALIAS_PRESENT
PREFERRED_PROVIDER
MINIMAL_PROVIDER_SET
FORBIDDEN_PROVIDER
POLICY_DENIED
CONNECTOR_UNHEALTHY
CAPABILITY_NOT_SUPPORTED
ENVIRONMENT_UNSUPPORTED
PROVIDER_LIMIT_EXCEEDED
RUNTIME_ARTIFACT_UNAVAILABLE
LICENSE_DENIED
PAID_ARTIFACT_DENIED
OWNERSHIP_CONFLICT
ALTERNATIVE_NOT_NEEDED
MATERIAL_TIE
OPTIONAL_CAPABILITY_OMITTED
```

Explanations are short structured facts. They do not contain hidden reasoning.

## 17. Deterministic Route Plan

The route-decision digest excludes:

- `createdAt`
- `planId`
- `digest`
- `requestId`

It includes:

- Normalized requested capabilities and quality data
- Request preferences
- Project snapshot ID
- Catalog snapshot ID
- Policy snapshot ID
- Status
- Selected and rejected providers
- Ownership
- Constraints
- Uncertainty
- Required input

`digest` is the full SHA-256 canonical JSON digest.

`planId` is `route_` followed by the first 24 hexadecimal digest characters.

Changing request order, provider enumeration order, creation time, or project clone path must not change the route digest. Changing decision-bearing capability, project, catalog, policy, environment, or ownership data must change it.

## 18. CLI design

```bash
soren-sdk route \
  --project <path> \
  --capability <capability-id> \
  [--capability <capability-id>] \
  [--optional <capability-id>] \
  [--preferred <provider-id>] \
  [--forbidden <provider-id>] \
  [--max-providers <number>] \
  [--scope <scope>] \
  [--property <property>] \
  [--json]
```

The CLI:

1. Inspects the explicit project path.
2. Loads the catalog from the Soren SDK catalog root supplied to the CLI adapter.
3. Builds a normalized Route Request from flags.
4. Applies the global `scope` and `property` values to each requested capability in this first slice.
5. Routes without network or writes.
6. Emits human output or canonical JSON.

Exit codes:

- `0`: valid Route Plan, including `native`, `selected`, `no-sdk`, `needs-input`, or `blocked`
- `1`: catalog, inspection, contract, or router failure
- `2`: invalid CLI arguments

A blocked route is a successful router result and therefore exits `0`.

## 19. Errors

Stable router failures are reserved for invalid system inputs or inability to produce a valid Route Plan:

```text
ROUTE_REQUEST_INVALID
ROUTE_PROJECT_MISMATCH
ROUTE_PROJECT_INVALID
ROUTE_CATALOG_INVALID
ROUTE_POLICY_INVALID
ROUTE_PLAN_INVALID
```

Ordinary routing denials are represented inside a valid `RoutePlan` with `status: blocked`, not thrown as errors.

## 20. Test strategy

### Connector gates

- Manifest schema and semantic validation
- Healthy approved/selectable status
- Source, skill, compatibility, and evaluation file existence
- Runtime version and license accuracy
- Capability IDs exist in the ontology
- No hidden paid companion requirement

### Router unit tests

- Input validation
- Candidate filtering
- Environment parsing
- Policy constraints
- Provider-set minimization
- Installed-dependency preference
- Preferred and forbidden provider behavior
- Ownership conflict and ambiguity
- Stable explanations
- Route Plan contract validation
- Digest determinism

### Golden evaluation suite

At least 30 fixtures across:

- Native CSS, CSS animation, and WAAPI
- Motion presence, layout, shared layout, spring, drag, and gesture
- GSAP timeline, SVG, FLIP, ScrollTrigger, and pinned sequence
- Motion and GSAP composition on separate scopes/properties
- Same-scope/property conflict
- Same-scope missing-property ambiguity
- Provider-limit failure
- Unknown required and optional capabilities
- Forbidden provider
- Unhealthy connector
- Existing dependency reuse
- Legacy alias signal
- Unsupported React version
- Provider order invariance
- Capability order invariance
- Creation-time invariance
- Clone-path invariance
- Unrelated dependency invariance

### Permanent CI

The existing pipeline adds:

- Connector v2 health checks for Web Platform, Motion, and GSAP
- Router tests and golden fixtures
- Route CLI smoke tests
- Existing contracts, catalog, inspector, build, and smoke gates

## 21. Merge gates

- Zero hard-policy violations
- Zero forbidden-provider selections
- Zero unhealthy or legacy provider selections
- Zero unresolved ownership conflicts
- Zero invalid Route Plans
- Native wins all approved simple-native fixtures
- Required capability coverage is complete
- At least 30 approved route fixtures pass
- No subprocess, network, package installation, tool invocation, or project writes

## 22. Risks and controls

### Risk: connector approval overstates integration readiness

Control: runtime selection depends only on the resolved runtime artifact. MCP and skills remain independently permissioned and uninvoked.

### Risk: custom GSAP license is treated like SPDX

Control: use the explicit internal expression `LicenseRef-GSAP-Standard` and retain the official terms URL in source metadata.

### Risk: range parsing silently accepts unsupported React versions

Control: support only documented common range forms and block unknown required cases.

### Risk: deterministic ranking hides an architectural tie

Control: stable-ID ordering is permitted only after routes are proven behaviorally equivalent; otherwise return `needs-input`.

### Risk: native coverage disappears from selected-provider output

Control: native coverage is represented through ownership and constraint records while `selectedProviders` remains reserved for third-party providers to preserve Route Plan status semantics.

## 23. Spec self-review

- No placeholders or unresolved design decisions remain.
- Connector migration is a prerequisite, not bypassed router logic.
- Route Plan status semantics match the current schema.
- Native coverage does not consume `maxProviders`.
- Policy, catalog, and project IDs are reproducible.
- Scope remains a single vertical slice and excludes natural-language interpretation and execution.
