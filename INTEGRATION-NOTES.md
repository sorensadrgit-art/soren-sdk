# Phase 6 Integration Notes

Phase 6 exposes protocol surfaces without waiting for neighboring phases.

Temporary mappings:

- Phase 4 route behavior is represented by `SorenApplication.route()` returning a deterministic `NOT_IMPLEMENTED` payload with `replacementPhase: "phase-4"`.
- Phase 5 policy behavior is isolated behind `ResolvedPolicyProvider` and currently wired to `FakeResolvedPolicyProvider`.
- Phase 7 context behavior is isolated behind `ContextSelectionProvider` and currently wired to `FakeContextSelectionProvider`.
- Phase 8 plan/evidence behavior is isolated behind `PlanEvidenceProvider` and currently wired to `FakePlanEvidenceProvider`.
- Phase 9 apply behavior is isolated behind `ApplyProvider`, wired to `DisabledApplyProvider`, and is not exposed through REST, MCP, or SDK mutation surfaces.

Replacement steps:

1. Replace fake providers in `packages/application/src/adapters/fakes/` with adapters over the merged neighboring service packages.
2. Keep the `SorenApplication` interface stable and update only provider wiring.
3. Preserve canonical output equivalence across direct application calls, TypeScript SDK, REST, and MCP.
4. Keep apply disabled until the approved execution safety phase lands.
