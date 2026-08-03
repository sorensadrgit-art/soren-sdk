# Rollback

## 1. Purpose

Every mutation in an apply run is preceded by a before-state capture, so the
run can be reverted in reverse order on failure or cancellation. Rollback is
verified by snapshot digest comparison.

## 2. Before-state capture

Before each mutation the apply service records:

- File type (file / directory / missing / unknown)
- Before digest (`sha256` of file bytes)
- Rollback-safe content reference
- Portable mode information
- Operation order (index)

These fields are portable and are the basis of the `rollback-record`
contract in `schemas/rollback-record.schema.json`.

## 3. Reverse rollback

On failure or cancellation:

1. Stop remaining operations.
2. Roll back applied operations in reverse order.
3. Verify each rollback by digest.
4. Report full or partial rollback.
5. Preserve failure evidence in the result.

The service never reports success after a rollback failure. The status is
`rollback-failed` and `recoverable` is `false`.

## 4. Verification

After the reverse pass, the service takes an after-snapshot and compares its
digest to the before-snapshot digest. A matching digest means the sandbox was
fully restored. A mismatched digest (or a failed removal) marks the rollback
as failed or partial.

## 5. Rollback records

Each applied operation produces a `RollbackRecordEntry` in the apply result:

```ts
interface RollbackRecordEntry {
  operationIndex: number;
  path: string;
  reverted: boolean;
  verified: boolean;
  error: string | null;
}
```

## 6. Crash-state recovery

If the process crashes mid-apply, a `CrashStateRecord` is recorded before
any rollback is attempted:

```ts
interface CrashStateRecord {
  runId: string;
  sandboxId: string;
  executionPlanId: string;
  executionPlanDigest: string;
  startedAt: string;
  lastOperationIndex: number;
  operationsApplied: number;
  beforeSnapshotDigest: string;
  recoverable: boolean;
  recordedAt: string;
}
```

A subsequent recovery run can resume or roll back using the record and the
before snapshot digest.