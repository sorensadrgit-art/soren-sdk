# Phase 9 Recovery Hardening Handoff

## Scope

This branch closes an authoritative-state TOCTOU gap independently of the SQLite preparation and approval-consumption work. It does not change run-ID generation, approval nonce ownership, or Jules-owned durability tests.

The apply service now rechecks authoritative state after awaited content or preimage acquisition and immediately before each filesystem mutation.

## Completed regression coverage

`packages/apply/test/mutation-boundary-toctou.test.ts` proves:

1. Project state changed inside `contentProvider()` blocks a create/replace before `sandbox.write()`.
2. Project state changed during delete preimage capture blocks deletion before `sandbox.remove()`.
3. A valid replacement approval that reuses the same `approvalId` but changes its integrity digest or nonce is rejected as revoked/replaced.
4. The mutation-race paths return a rolled-back result with zero filesystem mutations.

## Durable rollback integration contract

The SQLite recovery store must persist enough information for a newly constructed service to restore a run without access to the original process memory:

- crash-state record keyed by `runId`
- rollback records in operation order
- before-snapshot digest
- sandbox ID and sandbox policy needed to reopen the same sandbox
- before-content blob or durable content reference for every applied replace/delete
- explicit missing-before-state marker for every applied create

## Required cross-service test

1. Service A prepares a plan containing replace, delete, and create operations.
2. Service A mutates enough operations to persist rollback state, then simulates interruption before in-process rollback completes.
3. Close service A and its SQLite connection.
4. Construct service B with a new store instance pointing at the same temporary SQLite file.
5. Load the persisted crash record by `runId` and reopen the same sandbox.
6. Run recovery rollback from service B.

The test must assert:

- replaced files contain their exact original bytes
- deleted files are recreated with their exact original bytes
- newly created files are absent
- implicit parent directories created by the failed run are absent unless they existed in the before snapshot
- rollback executes in reverse operation order
- every rollback entry has `reverted: true`, `verified: true`, and `error: null`
- `verifiedDigest` equals the persisted before-snapshot digest
- final status is `rolled-back`

## Persistence ordering

Before a filesystem mutation is allowed, the store must durably commit the rollback preimage or missing-state marker for that operation. A crash between persistence and mutation is safe because rollback removal/write is idempotent.

The crash record must be updated after each successful mutation so a restarted service knows the highest applied operation index. Do not mark an operation applied before the filesystem mutation succeeds.

## Failure and tamper coverage

Add restart tests for each failure mode:

- missing rollback blob or content reference
- rollback blob whose digest does not match its stored digest
- crash record referencing an unknown operation index
- before-snapshot digest mismatch after rollback
- a second recovery caller racing the first caller

Each failure must produce `APPLY_ROLLBACK_FAILED` or a `rollback-failed` result, preserve diagnostic evidence, and never emit or return an applied/success state. A failed or incomplete restore must remain recoverable when valid rollback data still exists.

## SQLite transaction guidance

- Atomically reserve one recovery attempt per run.
- Treat a completed recovery as idempotent; a repeat request should report the already-restored state without replaying writes.
- Keep nonce reservation ownership separate from preparation consumption ownership.
- For the mutation-boundary recheck added here, replace the temporary in-memory `approvalAlreadyReserved` flag with an ownership-aware store query such as “reserved by this run” when the SQLite API is merged.
- Do not skip approval replay validation merely because any reservation exists; skip it only when the reservation belongs to the current `runId`.

## Merge notes

The production change touches only `packages/apply/src/apply-service.ts`. The new test is self-contained and injects complete authoritative providers, so it should remain compatible with Jules's fixture-store changes.

## Verification state

Verified on this branch:

- `pnpm exec eslint packages/apply/src/apply-service.ts packages/apply/test/mutation-boundary-toctou.test.ts`
- `pnpm --filter @soren-sdk/apply build`
- `pnpm --filter @soren-sdk/apply exec vitest run test/mutation-boundary-toctou.test.ts test/preparation-binding.test.ts`
- Result: 2 test files passed, 5 tests passed.
- `git diff --check`

The full apply typecheck and test suite are not green on the durability base branch because several existing tests still use removed construction APIs or omit the required authoritative/store dependencies. Those are the same fixtures Jules reported repairing in his SQLite branch. This branch intentionally does not edit those files to avoid merge conflicts.
