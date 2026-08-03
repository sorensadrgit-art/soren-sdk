import { digestJson, type Digest, type JsonValue } from "@soren-sdk/contracts";

export interface DurableRecoveryRecord {
  runId: string;
  sandboxPolicyRef: string;
  executionPlanId: Digest;
  beforeDigest: Digest;
  expectedDigest: Digest;
  operations: readonly RecoveryOperation[];
  priorContent: Readonly<Record<string, string>>;
  createdDirectories: readonly string[];
  state: "applied" | "rolling-back" | "rolled-back" | "rollback-failed";
}
export type RecoveryOperation = { kind: "replace" | "delete"; path: string } | { kind: "create"; path: string; content: string } | { kind: "mkdir"; path: string };
export interface RecoverySandbox { read(path: string): Promise<string | undefined>; write(path: string, content: string): Promise<void>; remove(path: string): Promise<void>; mkdir(path: string): Promise<void>; digest(): Promise<Digest>; }
export interface RecoveryStore { load(runId: string): Promise<DurableRecoveryRecord | undefined>; save(record: DurableRecoveryRecord): Promise<void>; }
export interface RecoverySandboxProvider { open(policyRef: string): Promise<RecoverySandbox>; }

/** Restart-safe public rollback path. It uses only a durable record and injected providers. */
export async function rollbackFromRecovery(runId: string, store: RecoveryStore, sandboxes: RecoverySandboxProvider): Promise<DurableRecoveryRecord> {
  const record = await store.load(runId);
  if (record === undefined) throw new TypeError("Recovery record missing.");
  if (record.state === "rolled-back") return record;
  const sandbox = await sandboxes.open(record.sandboxPolicyRef);
  const rolling = { ...record, state: "rolling-back" as const };
  await store.save(rolling);
  try {
    for (const operation of [...record.operations].reverse()) {
      const prior = record.priorContent[operation.path];
      if (operation.kind === "create") await sandbox.remove(operation.path);
      else if (prior === undefined) await sandbox.remove(operation.path);
      else await sandbox.write(operation.path, prior);
    }
    for (const directory of [...record.createdDirectories].sort((a, b) => b.localeCompare(a))) await sandbox.remove(directory);
    const actual = await sandbox.digest();
    if (actual !== record.beforeDigest) throw new TypeError("Recovery digest mismatch.");
    const complete = { ...rolling, state: "rolled-back" as const };
    await store.save(complete);
    return complete;
  } catch (error) {
    const failed = { ...rolling, state: "rollback-failed" as const };
    await store.save(failed);
    throw error;
  }
}

export function recoveryIdentity(record: Omit<DurableRecoveryRecord, "expectedDigest">): Digest {
  return digestJson(record as unknown as JsonValue);
}
