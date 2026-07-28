# Architecture Review — Hardening Soren SDK to a 10/10 Plan

**Review date:** 2026-07-27  
**Scope:** Repository architecture, connector model, routing, security, execution, evaluation, and agent portability  
**Review outcome:** Strong concept; foundational contract changes required before implementation

## Executive assessment

The existing plan has a strong product vision and unusually good instincts:

- Capability-first SDK selection
- Selective context loading
- Explicit animation ownership
- Read-only project inspection
- Planning separated from dependency mutation
- Evidence-backed completion
- Official sources preferred over model memory
- Control Center deferred until the core works

However, the current plan is not yet safe to implement as written. It scores approximately **7.8/10 as an architecture blueprint** because several core models conflate concepts that need different trust, version, permission, and lifecycle rules.

The revised target is:

> Soren SDK is a local-first, policy-governed SDK intelligence and execution broker. It discovers capabilities, resolves the smallest safe provider set, exposes the same operations through CLI, REST, MCP, and a TypeScript SDK, and can move from read-only advice to explicitly approved sandboxed execution with reproducible evidence.

## Critical findings

### 1. The connector object currently represents too many things

The first manifest format treats an SDK product, npm package, documentation site, MCP server, agent skill, CLI, recipe set, and validator as one connector.

These artifacts have different:

- Publishers
- Versions
- Licenses
- Authentication requirements
- Execution risks
- Update cadences
- Permissions
- Availability

**Decision:** Separate `SdkProduct`, `IntegrationArtifact`, `CapabilityClaim`, `OwnershipClaim`, and `VerificationRequirement`.

### 2. “Trust: official” is ambiguous and potentially misleading

The manifests are authored by Soren SDK, not by Motion, GSAP, Storybook, or shadcn. Their sources may be official, but that does not make the Soren-authored connector itself official.

**Decision:** Replace one-dimensional trust with:

- `publisher`
- `sourceAuthority`
- `integrityLevel`
- `reviewStatus`
- `executionRisk`
- `dataExposure`

### 3. The current manifests violate the current connector standard

The standard expects source, compatibility, skill, recipe, validator, and test artifacts—or an explicit declaration that they are missing. The first manifests contain only `sdk.manifest.json` and do not declare their incomplete state.

Several runtime version fields also contain prose such as “define during implementation,” which is invalid as a machine version constraint.

**Decision:** All manifests are non-selectable until they validate against Connector Schema v2 and their blockers are cleared.

### 4. Pairwise compatibility does not scale

A matrix of SDK A versus SDK B cannot fully represent:

- Same SDKs used on different elements
- Different properties on the same element
- Version-specific conflicts
- Resource budgets
- Framework or SSR constraints
- Transport or permission conflicts

**Decision:** Use declarative provider claims and policy constraints. Pairwise relationships become overrides and documentation, not the primary engine.

### 5. The router lacks a first-class native or no-SDK outcome

The evaluations expect CSS for simple transitions, but the catalog contains only third-party SDKs. This biases routing toward installing a library.

**Decision:** Add the Web Platform as a built-in provider and support explicit route outcomes:

- `selected`
- `native`
- `no-sdk`
- `needs-input`
- `blocked`

### 6. Agent adapters are too vendor-specific in the core architecture

Hardcoded Hermes, OpenClaw, OpenCode, Codex, and Claude Code adapters will duplicate logic and age poorly.

**Decision:** The core exposes vendor-neutral use cases and schemas. CLI, REST, MCP, and TypeScript SDK surfaces must remain behaviorally equivalent. Optional agent profiles may translate configuration, but must not duplicate SDK knowledge or hardcode model identity.

Hermes may remain the primary implementation agent and OpenClaw the independent auditor in the reference workflow, while the platform itself stays universal.

### 7. Planning exists, but safe execution is underspecified

Dependency planning is separated from writing, but there is no defined execution engine, transaction model, rollback, sandbox, worktree strategy, or explicit consent boundary.

**Decision:** Introduce `plan` and `apply` as separate contracts. `apply` requires explicit approval, a branch or worktree, command allowlists, scoped filesystem and network access, timeouts, diff review, rollback data, and post-apply verification.

### 8. Reproducibility needs a lockfile

A future route decision can change when documentation, skills, MCP tools, policies, or SDK versions change.

**Decision:** Add `soren-sdk.lock` containing the catalog snapshot, connector versions, source digests, policy version, selected integration artifacts, and protocol versions.

### 9. The security model needs an explicit agent/tool threat model

The current governance document covers credentials and permissions but does not fully model:

- Prompt injection in documentation
- Malicious tool descriptions
- MCP proxy confused-deputy attacks
- Token passthrough
- SSRF during OAuth discovery
- Local MCP server code execution
- Dependency and skill supply-chain compromise
- Unauthorized write escalation

**Decision:** Treat all retrieved content and tool metadata as untrusted data until reviewed. Add per-run grants, consent, network policy, sandboxing, provenance, hashes, and audit events.

### 10. Evaluation gates are too soft

A 90% routing score can hide serious safety failures. A router that selects a forbidden SDK once in ten cases is unacceptable.

**Decision:** Separate quality metrics from hard safety gates:

- Hard-constraint violations: 0 allowed
- Forbidden connector selection: 0 allowed
- Exact-set accuracy
- Per-capability precision and recall
- Unnecessary SDK rate
- Abstention calibration
- Metamorphic consistency
- Multi-agent implementation results
- Human visual review

### 11. The package plan risks premature micro-package fragmentation

The architecture creates many packages before any working vertical slice exists.

**Decision:** Start with a compact MVP:

- `@soren-sdk/contracts`
- `@soren-sdk/core`
- `@soren-sdk/connectors`
- `@soren-sdk/cli`
- `@soren-sdk/protocol-server`
- `@soren-sdk/testing`

Split internal modules into packages only when ownership, release cadence, or dependency pressure justifies it.

### 12. Persistence and observability are missing

The platform needs durable catalog snapshots, approvals, evidence, evaluation history, and connector health.

**Decision:** Add a storage interface with SQLite as the local-first default and an optional PostgreSQL adapter later. Add privacy-safe OpenTelemetry traces and metrics without recording prompts or source content by default.

## Revised non-negotiable invariants

1. Native platform capabilities are considered before third-party SDKs.
2. No connector is selectable while required versions, licenses, sources, or safety metadata are unresolved.
3. The same use-case contracts power CLI, REST, MCP, and TypeScript SDK surfaces.
4. No agent or model identifier is hardcoded into core routing.
5. Identity comes from authenticated principal and run context.
6. Planning is read-only; application is explicit, sandboxed, transactional, and reviewable.
7. Tool descriptions and retrieved documentation are untrusted input.
8. Compatibility is policy- and scope-aware, not only pairwise.
9. Every decision is reproducible from a catalog snapshot and lockfile.
10. Hard safety constraints have a 100% pass requirement.
11. Evidence records facts and rationale, never hidden reasoning.
12. Control Center remains a client of the core, never the source of truth.

## Revised first vertical slice

Do not implement all six SDKs at once.

Prove the architecture using:

- Web Platform baseline
- Motion
- GSAP

The first route suite should answer:

- When CSS is enough
- When WAAPI is enough
- When Motion is correct
- When GSAP is correct
- When Motion and GSAP may coexist
- When the router must abstain
- When a route is blocked by policy

Only after this slice passes should Lenis, React Three Fiber, Storybook, and shadcn be activated.

## Final verdict

The original idea is worth building. The improvement is not “more SDKs.” The improvement is a stronger operating model:

- Products are separated from integration artifacts.
- Authority is separated from execution trust.
- Native capabilities are first-class.
- Routing is governed by policy and reproducible state.
- Tool access is brokered.
- Execution is explicit and reversible.
- Agent support is protocol-based rather than vendor-hardcoded.
- Evaluation distinguishes quality from safety.

These changes make Soren SDK implementable, secure, explainable, and extensible without losing the original premium frontend focus.
