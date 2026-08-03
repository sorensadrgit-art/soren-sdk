# Phase 8 Integration Notes

- Phase 6 consumes `PlanEvidenceProvider` to expose immutable plans through protocol adapters. It does not duplicate planning logic.
- Phase 7 may implement `RunnerResultSource` to supply references collected from its read-only context/tool gateway.
- Phase 9 consumes an exact execution plan and verification plan. It may execute only after a separate approval and drift check, and cannot mutate either plan.
- All unfinished services are represented by deterministic in-memory fakes in package tests. No Phase 8 package imports process execution APIs.
