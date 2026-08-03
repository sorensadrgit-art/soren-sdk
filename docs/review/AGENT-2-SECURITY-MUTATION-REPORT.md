# Agent 2 Security and Mutation Review

## Scope and revision

- Branch: `review/security-mutation-agent-2`
- Base: `7a0b1f6bdb796622bf70368721b0ea7403c3a1c8` (`review/phase9-master-fixes` at branch creation)
- Phase 7 reviewed head carried forward: `698bc71adbcc4da3c29efc3509e0bb92b854118a`
- Head: recorded at PR creation
- Target PR base: `review/phases-5-9-master-antigravity`

## Findings and corrections

### Critical corrected: mutable global sandbox capability

`DefaultApplyService` previously obtained the mutation boundary from mutable `globalThis`. Any code in-process could replace that factory. The service now receives a `SandboxProvider` through constructor injection. The global hook and `registerSandboxFactory` export were removed.

### Critical corrected: caller-forgeable preparation

`apply()` previously trusted a structural `ApplyPreparation` supplied by its caller. It now checks that the exact frozen preparation object was created and retained by the same service instance. Copies, mutations, unknown run IDs, and reused preparations return `APPLY_PREPARATION_INVALID` before a sandbox is created.

### High corrected: rollback left implicitly created parent directories

Rollback now compares the final snapshot against the strict before digest and removes only empty parent directories absent from the before snapshot, deepest first. Existing directories remain. The final digest is still authoritative and mismatch is `rollback-failed`.

### Phase 7 preserved

The review commits at `698bc71a` were carried forward. Regression coverage confirms normalized/deduplicated grant tool IDs, provider identity binding, tool-description inventory addressing, UTF-8 response limits, and inventory drift detection. The core context gateway is now exported as a public core port and context selection additionally supports a deterministic UTF-8 byte budget.

## Verification evidence

Passed locally after the changes:

- `pnpm install --frozen-lockfile`
- `pnpm -r --if-present build`
- `pnpm --filter @soren-sdk/core test` (21 tests)
- `pnpm --filter @soren-sdk/apply test` (28 tests)
- `pnpm --filter @soren-sdk/sandbox test` (49 tests)
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` twice
- `pnpm build` twice
- `pnpm validate:repository` twice
- `pnpm smoke:cli` twice

The local runtime is Node 22.23.2 while the repository requires Node 24+. Every command passed but emitted that environment warning. Repository validation also reported six known legacy planning manifests as warnings, with zero validation errors.

## Mutation and sandbox guarantees

- Public `DefaultApplyService` remains disabled and returns `APPLY_DISABLED`.
- Test-only construction requires a private module capability via `createApplyServiceForTesting`.
- No shell, package-install, network, deployment, publishing, credential, protected-branch, or original-workspace mutation capability was added.
- Sandbox enforcement remains path scoped and resource limited.
- Rollback operates in reverse order and succeeds only when final snapshot digest equals the recorded before digest.

## Residual risks and required Agent 1 integration

This branch is **CHANGES REQUIRED**, not ready for master integration.

1. Phase 9 still needs a durable, process-independent preparation/rollback store. In-memory records are not sufficient for crash recovery.
2. Current project, resolved policy, VCS state, and sandbox policy providers must be injected and queried immediately before mutation. The present service rechecks retained inputs but does not yet obtain fresh authoritative snapshots.
3. Execution-plan recomputation and schema validation must be supplied by Agent 1's shared public Phase 8 contract. Do not create a second plan format. Required public adapter: validate shared execution plan, recompute immutable digest, and verify executionPlanId deterministically.
4. Phase 7 has additional critical gaps confirmed by an independent review: grants are self-hashed but forgeable, with no canonical store, opaque identity, revocation, or lifecycle; calls have no call-count, timeout, cancellation, or streaming response limit; input/output schemas are absent. Protocol versions are inventory metadata rather than negotiated state. Remote project-content authorization relies on a self-attested tool label. The exact source locations and remediation proposals are recorded in `AGENT-2-SECURITY-CORPUS-RESULTS.md`.
5. Retrieved content remains explicitly untrusted but its public fragment shape needs an immutable `instructionAuthority: "none"` envelope so downstream Phase 6 consumers cannot confuse it with policy.
6. Required red-team coverage remains incomplete for symlink race, special file, approval concurrency, current-state drift, cancellation race, crash recovery durability, inventory substitution, read-only grant reuse for apply, and credential leakage.
7. Original-fixture byte-for-byte post-test verification was not available in the Phase 9 test fixtures and must be added.

Recommendation: **CHANGES REQUIRED**.
