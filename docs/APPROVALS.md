# Approvals

## 1. Purpose

An approval is the explicit, single-use authorization to apply an immutable
execution plan inside an isolated sandbox. It binds to the exact plan, the
exact project snapshot, and the exact policy snapshot. It names the allowed
operations, paths, command IDs (none in Phase 9), and network hosts (none in
Phase 9), and it carries strict resource limits and an expiration.

Approval data **never contains credentials**. There is no token, key,
password, or secret field in the approval contract. Secrets that a plan
requires are referenced by environment-variable-style name only, never
included, and Phase 9 does not implement credential use at all.

## 2. Contract

The approval contract is `schemas/apply-approval.schema.json`, mirrored by
the `ApplyApproval` TypeScript type in `packages/apply/src/types.ts`.

Required fields:

- `approvalId`
- `executionPlanId`
- `executionPlanDigest` (exact immutable plan digest)
- `projectSnapshotId` (exact project snapshot digest)
- `policySnapshotId` (exact policy snapshot digest)
- `allowedOperations`
- `allowedPaths`
- `allowedCommandIds` (must be empty in Phase 9)
- `allowedNetworkHosts` (must be empty in Phase 9)
- `limits` (`maxFiles`, `maxBytes`, `maxOperations`, `maxDurationSeconds`)
- `expiresAt`
- `approver` (`id`, `kind`)
- `nonce` (one-time, 16–128 URL-safe characters)
- `integrityDigest`

## 3. Integrity

`integrityDigest` is the canonical-json digest of every field except itself.
`packages/apply/src/approval-validation.ts` recomputes the digest and
rejects any mismatch. This makes replay and tampering detectable: changing
any bound field invalidates the digest.

## 4. One-time use

The service tracks used approval nonces. A nonce used once is rejected on
any subsequent attempt (`APPLY_APPROVAL_REPLAYED`). The nonce is marked used
only after a completed apply run.

## 5. Expiration

`assertApprovalNotExpired` compares the current clock against `expiresAt`.
Expired approvals are rejected before any mutation.

## 6. Hard gates

See `docs/APPLY-SANDBOX.md` §4. Any claim in an approval that exceeds the
sandbox policy (e.g., more files, bytes, operations, or time than the policy
allows) fails the `limits.within-policy` gate. Any command or network
request fails the `execution.denied` gate in Phase 9.

## 7. Lifecycle

1. Coordinator creates an execution plan (immutable digest).
2. Approver produces an approval bound to the plan, project, and policy.
3. `ApplyService.prepare` validates all gates.
4. `ApplyService.apply` re-verifies before the first mutation and applies.
5. The nonce is consumed and the result is recorded with evidence.

## 8. Anti-patterns

- Never put credentials or secrets in approval data.
- Never reuse a nonce.
- Never bind an approval to a mutable plan ID without a digest.
- Never allow an approval to outlive its expiration.
- Never bypass the sandbox policy with approval limits.