# Phase 8 Design: Planning, Verification, and Evidence

## Scope

Phase 8 is a read-only control-plane/data-plane slice. It creates immutable execution proposals, verification requirements, and runner-derived evidence. It neither applies a plan nor executes proposed commands.

## Boundaries

- `@soren-sdk/planner` creates and validates `ExecutionPlan` records.
- `@soren-sdk/verification` creates deterministic verification plans from generic check requirements.
- `@soren-sdk/evidence` accepts structured runner results and produces/verifies content-addressed evidence.
- `@soren-sdk/cli` adapts files and arguments to these application services. Writes are limited to explicit output paths and use atomic replacement.
- The planner, verification, and evidence packages must not import `node:child_process` or project-writing APIs.

## Determinism and identity

Canonical JSON plus SHA-256 from `@soren-sdk/contracts` defines all identities. Plan and evidence identities are calculated from normalized, sorted semantic content. Presentation timestamps are excluded from their identity preimages so equivalent requests, reordered lists, and independently ordered runner results have identical digests.

Every evidence envelope binds project, catalog, policy, route, and execution-plan identities. The `EvidenceService` rejects runner results with any other plan ID or digest.

## Verification states

| State | Meaning |
| --- | --- |
| `passed` | Trusted runner result completed successfully and all required artifact digests verified. |
| `failed` | Trusted runner reported failure. |
| `not-run` | Required or optional check has no runner result. |
| `not-required` | Check was deterministically waived with an explicit reason. |
| `blocked` | Check cannot start because a declared prerequisite is unavailable. |
| `cancelled` | Runner cancelled the check. |
| `timed-out` | Runner exceeded its declared limit. |
| `unverified` | Result exists but cannot establish the required trust or integrity property. |

Missing evidence never becomes `passed`. A required check missing a result remains `not-run`.

## Trust and redaction

Runner input is structured data, not narration. A result carries runner identity/version, exact plan binding, timestamps, status/exit details, diagnostics, artifacts, environment, redactions, and optional integrity metadata. Artifact references include a SHA-256 digest and are verified during ingest. Redaction values cannot target check identity, check state, plan binding, or artifact digest. Secret-like values are rejected before evidence construction.

## Drift

`ExecutionPlanner.compare` compares immutable input snapshot IDs/digests, route plan identity, context references, approved constraints, optional lockfile, and runner capability description. Any difference is reported as a named blocking drift item.

## Ports

`PlanEvidenceProvider` is the immutable Plan 8 read port intended for Phase 6. `RunnerResultSource` is the narrow pull port for Phase 7 evidence references. Phase 9 receives immutable plans and verification plans but cannot modify them.
