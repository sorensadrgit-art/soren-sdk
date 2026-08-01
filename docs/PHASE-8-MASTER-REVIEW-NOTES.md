# Phase 8 Master Review Notes

This review branch adds permanent RED regressions for execution-plan content addressing and evidence-envelope integrity.

Current review targets:

- Recompute and verify execution plan immutable digests.
- Verify execution plan IDs are derived from the immutable digest.
- Compare semantic planning inputs canonically rather than through object insertion order.
- Reject passed required checks without trusted runner artifacts during ingestion.
- Verify evidence IDs are derived from evidence digests.
- Verify `unverified` is consistent with required check states.

The branch is not merge-ready until exact-head permanent CI passes.
