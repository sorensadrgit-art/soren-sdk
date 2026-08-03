# Phase 9 Recovery Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close authoritative-state TOCTOU gaps at the mutation boundary and provide merge-ready recovery coverage without modifying Jules's SQLite preparation or approval-consumption work.

**Architecture:** Keep the initial pre-reservation authoritative check, then perform a second post-reservation mutable-state check after asynchronous content/preimage acquisition and immediately before each write or remove. Add focused tests that mutate authoritative project state during those awaited operations and prove the sandbox mutation count remains zero.

**Tech Stack:** TypeScript 6, Vitest 4, pnpm workspace, `@soren-sdk/apply`, `@soren-sdk/sandbox`.

## Global Constraints

- Do not modify `preparation-binding.test.ts` or `rollback-restoration.test.ts`; Jules owns their SQLite injection changes.
- Do not change run-ID generation or approval reservation semantics.
- Assert structured `ApplyError.code` where an error escapes; assert final status and zero mutations for errors captured inside apply orchestration.
- Preserve rollback and evidence behavior for already-mutated runs.

---
### Task 1: Reproduce content-provider TOCTOU drift

**Files:**
- Create: `packages/apply/test/mutation-boundary-toctou.test.ts`
- Modify: `packages/apply/src/apply-service.ts`

**Interfaces:**
- Consumes: `createApplyServiceForTesting(options)` and `DefaultApplyService.apply(input)`.
- Produces: a regression proving authoritative drift during `contentProvider()` blocks `sandbox.write()`.

- [ ] **Step 1: Write the failing create-file race test**

Build a valid single-create preparation. In `contentProvider`, replace the authoritative project snapshot ID before returning valid bytes. Assert the result is `rolled-back`, contains `Project snapshot or revision changed.`, and the sandbox write count is `0`.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @soren-sdk/apply exec vitest run test/mutation-boundary-toctou.test.ts`
Expected: FAIL because the current service writes after `contentProvider()` changes authoritative state.

- [ ] **Step 3: Add a post-reservation state-check mode**

Refactor `#assertFreshAuthoritativeState` to accept whether the approval has already been reserved. In post-reservation mode, retain approval integrity, expiration, plan binding, project, policy, VCS, and sandbox-policy checks while skipping only the unused-nonce assertion for the run's own reservation.

- [ ] **Step 4: Recheck immediately before write**

After content digest validation and resource reservation, call the post-reservation authoritative check immediately before recording rollback state and invoking `sandbox.write()`.

- [ ] **Step 5: Verify GREEN**

Run the focused Vitest command and confirm the regression passes.

### Task 2: Reproduce delete preimage TOCTOU drift

**Files:**
- Modify: `packages/apply/test/mutation-boundary-toctou.test.ts`
- Modify: `packages/apply/src/apply-service.ts`

**Interfaces:**
- Consumes: the post-reservation authoritative check from Task 1.
- Produces: a regression proving drift during `sandbox.read()` blocks `sandbox.remove()`.

- [ ] **Step 1: Write the failing delete race test**

Use a sandbox whose `read()` returns the original file bytes and then changes the authoritative project snapshot ID. Assert apply returns `rolled-back`, records the drift error, performs zero removes, and leaves the original bytes readable.

- [ ] **Step 2: Verify RED**

Run the focused Vitest file. Expected: FAIL because the current service removes the file after the awaited preimage read.

- [ ] **Step 3: Recheck immediately before remove**

After preimage capture and resource reservation, call the post-reservation authoritative check immediately before recording rollback state and invoking `sandbox.remove()`.

- [ ] **Step 4: Verify GREEN**

Run the focused Vitest file and confirm both race cases pass.

- [ ] **Step 5: Commit the isolated TOCTOU change**

Run:
`git add packages/apply/src/apply-service.ts packages/apply/test/mutation-boundary-toctou.test.ts docs/superpowers/plans/2026-08-03-phase9-recovery-hardening.md`
`git commit -m "fix(apply): recheck authoritative state at mutation boundary"`

### Task 3: Integrate with durable recovery work

**Files:**
- Create: `docs/review/PHASE9-RECOVERY-HARDENING-HANDOFF.md`
- Do not modify Jules-owned SQLite store files until his branch is available.

**Interfaces:**
- Consumes: Jules's durable preparation, approval, crash-state, and rollback-content stores.
- Produces: exact acceptance cases for cross-service rollback and restore integration.

- [ ] **Step 1: Record the cross-service rollback acceptance case**

Specify that service A persists the crash record, rollback records, before-snapshot digest, sandbox policy, and before-content blobs; service B opens the same SQLite file and sandbox, loads the record by run ID, and rolls back in reverse order.

- [ ] **Step 2: Record the restore assertions**

Require replaced and deleted files to equal their original bytes, newly created files and implicit directories to be absent, every rollback entry to be verified, and the final snapshot digest to equal the persisted before-snapshot digest.

- [ ] **Step 3: Record the restart failure assertions**

Require missing or tampered rollback blobs to produce `APPLY_ROLLBACK_FAILED`, status `rollback-failed`, `recoverable: false`, and no success evidence.

- [ ] **Step 4: Run non-conflicting verification**

Run the new TOCTOU test, apply typecheck, and `git diff --check`. Document the pre-existing stale-fixture failures separately rather than changing Jules-owned tests.
