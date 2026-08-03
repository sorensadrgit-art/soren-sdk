# Phase 5, Phase 6, and Phase 8 Integration Notes

- Phase 6 consumes the Phase 5 `ResolvedPolicyProvider` through an explicit application adapter. Remote project inspection is denied unless the requested root is exactly an allowed root or a contained descendant.
- Phase 6 consumes Phase 8 `PlanEvidenceProvider` through explicit application adapters that expose immutable execution plans and verified evidence without duplicating planning or evidence logic.
- Phase 7 remains behind the typed `ContextSelectionProvider` port until its reviewed interface is integrated.
- Phase 9 remains behind the typed disabled `ApplyProvider` port. It is not exposed through REST, MCP, or TypeScript SDK mutation surfaces.
- Protocol surfaces preserve canonical output equivalence across direct application calls, TypeScript SDK, REST, and MCP.
- The application layer does not import process execution APIs. Apply remains separately approved, drift-checked, and immutable-plan bound.
