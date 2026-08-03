# Agent 2 Integration Notes

## Shared execution-plan contract, owned by Agent 1

Agent 2 did not modify `schemas/execution-plan.schema.json`, Phase 5 configuration/lockfile internals, Phase 6 protocol-server internals, or Phase 8 planner/evidence internals.

Phase 9 requires the following public adapter from Agent 1:

1. Validate an `ExecutionPlan` using the shared schema.
2. Canonically recompute `immutableDigest` over the shared contract's prescribed payload.
3. Deterministically verify `executionPlanId` from the same shared contract.
4. Provide an immutable approved-plan lookup keyed by executionPlanId and approval binding.
5. Provide current `ProjectSnapshot`, resolved policy snapshot, and VCS isolation state immediately before the first mutation.
6. Persist a durable preparation record and rollback content references so a new process can recover an interrupted sandbox run.

Until this adapter exists, the local Phase 9 service validates the retained plan and approval binding but must not claim complete process-independent recovery or fresh authoritative drift detection.

## Phase 6 public consumption of Phase 7

`@soren-sdk/core` now exports `context-gateway.ts` as a public port. Phase 6 can consume it without importing core implementation paths. Phase 6 must still own its protocol adapter and should map negotiated protocol metadata into the public gateway contract rather than duplicating authorization policy.

## Required post-integration tests

- Shared execution-plan tampering changes an operation, path, content digest, approval scope, or verification list after prepare and must block before sandbox creation.
- Provider returns a newer project or policy snapshot immediately before apply and must block before the first write.
- Persisted crash record is loaded in a new process and restores the original snapshot.
- Protocol adapter cannot obtain apply capability from a Phase 7 read-only grant.
