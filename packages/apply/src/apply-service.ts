import { createHash } from "node:crypto";
import type { SandboxProvider, SandboxSession, SandboxSnapshot } from "@soren-sdk/sandbox";

import {
  assertApprovalBindsPlan,
  assertApprovalBindsPolicy,
  assertApprovalBindsProject,
  assertPlanApplyMode,
  operationsFromPlan
} from "./drift-checks.js";
import {
  assertApprovalIntegrity,
  assertApprovalNotExpired,
  assertLimitsWithinPolicy,
  assertNoCommands,
  assertNoNetwork,
  assertOperationAllowed,
  assertPathAllowedByApproval
} from "./approval-validation.js";
import type { ApplyEvidenceSink } from "./ports.js";
import {
  ApplyError,
  type ApplyApprovedPlanInput,
  type ApplyDiffEntry,
  type ApplyEvidenceEvent,
  type ApplyOperationEvent,
  type ApplyPreparation,
  type ApplyResult,
  type ApplyService,
  type CrashStateRecord,
  type PrepareApplyInput,
  type RollbackInput,
  type RollbackRecordEntry,
  type RollbackResult
} from "./types.js";

export interface ApplyServiceOptions {
  clock?: { now(): number };
  evidenceSink: ApplyEvidenceSink;
  sandboxProvider?: SandboxProvider;
  /** Internal test-only capability. Production construction never enables apply. */
  testCapability?: symbol;
}

const TEST_APPLY_CAPABILITY = Symbol("soren-sdk.test-apply-capability");

/** Creates an apply service for deterministic tests only. Public adapters stay disabled. */
export function createApplyServiceForTesting(
  options: Omit<ApplyServiceOptions, "testCapability"> & Record<string, unknown>
): DefaultApplyService {
  return new DefaultApplyService({ ...options, testCapability: TEST_APPLY_CAPABILITY });
}

/**
 * Default apply service. Enforces all hard gates before the first mutation:
 * approval integrity, expiration, one-time use, plan digest, project/policy
 * snapshot, operation/path allowlists, command/network denial, sandbox
 * isolation, VCS protected-workspace state, resource limits, and rollback
 * capability. Command execution is disabled; no host shell executor is
 * created. Public exposure is disabled: adapters must gate on
 * `APPLY_DISABLED` until the coordinator approves exposure.
 */
export class DefaultApplyService implements ApplyService {
  readonly #evidenceSink: ApplyEvidenceSink;
  readonly #sandboxProvider: SandboxProvider | undefined;
  readonly #now: () => number;
  readonly #preparations = new Map<string, { preparation: ApplyPreparation; input: PrepareApplyInput; consumed: boolean }>();
  readonly #usedApprovals = new Set<string>();
  readonly #cancelledRuns = new Set<string>();
  readonly #crashStates = new Map<string, CrashStateRecord>();
  readonly #rollbackContents = new Map<
    string,
    Map<number, Uint8Array | null>
  >();
  #applyDisabled = true;

  constructor(options: ApplyServiceOptions) {
    this.#evidenceSink = options.evidenceSink;
    this.#sandboxProvider = options.sandboxProvider;
    this.#now = options.clock?.now ?? Date.now;
    this.#applyDisabled = options.testCapability !== TEST_APPLY_CAPABILITY;
  }

  prepare(input: PrepareApplyInput): ApplyPreparation {
    this.#assertApplyEnabled();
    const gates: ApplyPreparation["gates"] = [];
    const now = this.#now();

    this.#gate(gates, "approval.integrity", () => assertApprovalIntegrity(input.approval));
    this.#gate(gates, "approval.expiration", () =>
      assertApprovalNotExpired(input.approval, now)
    );
    this.#gate(gates, "approval.one-time", () => {
      if (this.#usedApprovals.has(input.approval.nonce)) {
        throw new ApplyError(
          "APPLY_APPROVAL_REPLAYED",
          `Approval nonce ${input.approval.nonce} has already been used.`
        );
      }
    });
    this.#gate(gates, "drift.plan", () => {
      assertPlanApplyMode(input.executionPlan);
      assertApprovalBindsPlan(input.approval, input.executionPlan);
    });
    this.#gate(gates, "drift.project", () =>
      assertApprovalBindsProject(input.approval, input.projectSnapshot)
    );
    this.#gate(gates, "drift.policy", () =>
      assertApprovalBindsPolicy(input.approval, input.policySnapshot)
    );
    this.#gate(gates, "execution.denied", () => {
      assertNoCommands(input.approval);
      assertNoNetwork(input.approval);
    });
    this.#gate(gates, "vcs.isolation", () => {
      if (input.vcsState.protectedBranch) {
        throw new ApplyError(
          "APPLY_DRIFT_PROJECT",
          `Workspace is on protected branch ${input.vcsState.branch ?? "unknown"}.`
        );
      }
    });
    this.#gate(gates, "limits.within-policy", () =>
      assertLimitsWithinPolicy(input.approval, input.sandboxPolicy)
    );

    const operations = operationsFromPlan(input.executionPlan);
    for (const operation of operations) {
      this.#gate(gates, `operation.${operation.index}`, () => {
        assertOperationAllowed(input.approval, operation.operation);
        assertPathAllowedByApproval(input.approval, operation.path);
      });
    }

    const failedGates = gates.filter((gate) => gate.status === "failed");
    const runId = `run_${input.approval.nonce.slice(0, 16)}`;

    const preparation: ApplyPreparation = {
      runId,
      preparedAt: new Date(now).toISOString(),
      executionPlanId: input.executionPlan.executionPlanId,
      executionPlanDigest: input.executionPlan.immutableDigest,
      projectSnapshotId: input.projectSnapshot.snapshotId,
      policySnapshotId: input.policySnapshot.digest,
      sandboxPolicyId: input.sandboxPolicy.policyId,
      vcsState: input.vcsState,
      approvalNonce: input.approval.nonce,
      gates,
      operations,
      ready: failedGates.length === 0
    };

    // Object identity is the preparation capability. Clones cannot authorize
    // mutation and the stored object is immutable after all gates pass.
    Object.freeze(preparation.gates);
    Object.freeze(preparation.operations);
    Object.freeze(preparation);
    this.#preparations.set(runId, { preparation, input, consumed: false });

    void this.#emit({
      kind: "apply.prepared",
      recordedAt: preparation.preparedAt,
      runId,
      redacted: true,
      detail: {
        executionPlanId: preparation.executionPlanId,
        gatesPassed: gates.length - failedGates.length,
        gatesFailed: failedGates.length,
        ready: preparation.ready
      }
    });

    return preparation;
  }

  async apply(input: ApplyApprovedPlanInput): Promise<ApplyResult> {
    this.#assertApplyEnabled();
    const preparation = input.preparation;
    const stored = this.#preparations.get(preparation.runId);
    if (stored === undefined || stored.consumed || stored.preparation !== preparation) {
      throw new ApplyError(
        "APPLY_PREPARATION_INVALID",
        "Apply preparation is unknown, modified, reused, or belongs to another service instance."
      );
    }
    // Re-run all binding checks immediately before the first mutation using
    // the internally retained input, never caller-supplied preparation data.
    assertApprovalIntegrity(stored.input.approval);
    assertApprovalNotExpired(stored.input.approval, this.#now());
    assertPlanApplyMode(stored.input.executionPlan);
    assertApprovalBindsPlan(stored.input.approval, stored.input.executionPlan);
    assertApprovalBindsProject(stored.input.approval, stored.input.projectSnapshot);
    assertApprovalBindsPolicy(stored.input.approval, stored.input.policySnapshot);
    assertNoCommands(stored.input.approval);
    assertNoNetwork(stored.input.approval);
    assertLimitsWithinPolicy(stored.input.approval, stored.input.sandboxPolicy);
    if (stored.input.vcsState.protectedBranch) {
      throw new ApplyError("APPLY_DRIFT_PROJECT", "Protected workspace cannot be mutated.");
    }
    stored.consumed = true;
    if (!preparation.ready) {
      throw new ApplyError("APPLY_NOT_READY", `Run ${preparation.runId} is not ready to apply.`);
    }
    if (input.sandboxId === "") {
      throw new ApplyError("APPLY_INPUT_INVALID", "A sandbox id is required.");
    }
    if (this.#cancelledRuns.has(preparation.runId)) {
      throw new ApplyError("APPLY_CANCELLED", `Run ${preparation.runId} was cancelled.`);
    }
    if (this.#usedApprovals.has(preparation.approvalNonce)) {
      throw new ApplyError(
        "APPLY_APPROVAL_REPLAYED",
        `Approval nonce ${preparation.approvalNonce} has already been used.`
      );
    }
    // Reserve the one-time approval before any asynchronous mutation work so
    // concurrent apply calls cannot race with the same preparation.
    this.#usedApprovals.add(preparation.approvalNonce);

    const startedAt = new Date(this.#now()).toISOString();
    const ops: ApplyOperationEvent[] = [];
    const rollbackRecords: RollbackRecordEntry[] = [];
    const rollbackContents = new Map<number, Uint8Array | null>();
    this.#rollbackContents.set(preparation.runId, rollbackContents);
    const errors: string[] = [];
    const limits = stored.input.approval.limits;
    const touchedPaths = new Set<string>();
    let actualOperations = 0;
    let actualBytes = 0;
    const reserve = (operation: (typeof preparation.operations)[number], bytes: number) => {
      const elapsed = this.#now() - Date.parse(startedAt);
      const nextFiles = touchedPaths.has(operation.path) ? touchedPaths.size : touchedPaths.size + 1;
      if (actualOperations + 1 > limits.maxOperations || nextFiles > limits.maxFiles || actualBytes + bytes > limits.maxBytes || elapsed > limits.maxDurationSeconds * 1000) {
        throw new ApplyError("APPLY_RESOURCE_LIMIT", "Actual apply resource limit exceeded; mutation was not performed.", { path: operation.path });
      }
      actualOperations += 1;
      actualBytes += bytes;
      touchedPaths.add(operation.path);
    };

    await this.#emit({
      kind: "apply.started",
      recordedAt: startedAt,
      runId: preparation.runId,
      redacted: true,
      detail: { executionPlanId: preparation.executionPlanId }
    });

    const sandbox = await this.#createSandbox(input.sandboxId, preparation.runId);
    let beforeSnapshot: SandboxSnapshot;
    try {
      beforeSnapshot = await sandbox.snapshot();
    } catch (error) {
      await sandbox.close().catch(() => undefined);
      throw new ApplyError(
        "APPLY_INPUT_INVALID",
        `Unable to snapshot sandbox ${input.sandboxId}: ${String(error)}`
      );
    }

    await this.#emit({
      kind: "apply.before-snapshot",
      recordedAt: new Date(this.#now()).toISOString(),
      runId: preparation.runId,
      redacted: true,
      detail: { beforeSnapshotDigest: beforeSnapshot.digest, sandboxId: input.sandboxId }
    });

    let failed = false;
    try {
      for (const operation of preparation.operations) {
        if (this.#cancelledRuns.has(preparation.runId)) {
          ops.push({
            index: operation.index,
            path: operation.path,
            operation: operation.operation,
            status: "skipped"
          });
          throw new ApplyError("APPLY_CANCELLED", `Run ${preparation.runId} was cancelled.`);
        }

        // Re-verify every gate immediately before the mutation.
        assertOperationAllowedGate(preparation, operation);

        const prior = await this.#captureBefore(sandbox, operation.path);
        const recordRollback = () => {
          rollbackContents.set(
            operation.index,
            prior === null ? null : new Uint8Array(prior)
          );
          rollbackRecords.push({
            operationIndex: operation.index,
            path: operation.path,
            reverted: false,
            verified: false,
            error: null
          });
        };

        switch (operation.operation) {
          case "create-file":
          case "replace-file": {
            const content = await input.contentProvider(operation.path);
            if (
              operation.contentDigest !== null &&
              digestBytes(content) !== operation.contentDigest
            ) {
              throw new ApplyError(
                "APPLY_DRIFT_PLAN",
                `Content for ${operation.path} does not match the immutable plan digest.`,
                { path: operation.path }
              );
            }
            reserve(operation, content.byteLength);
            recordRollback();
            await sandbox.write(operation.path, content);
            ops.push({
              index: operation.index,
              path: operation.path,
              operation: operation.operation,
              status: "applied"
            });
            break;
          }
          case "delete-file": {
            if (prior === null) {
              throw new ApplyError(
                "APPLY_DRIFT_PLAN",
                `Cannot delete ${operation.path}: file does not exist.`,
                { path: operation.path }
              );
            }
            reserve(operation, 0);
            recordRollback();
            await sandbox.remove(operation.path);
            ops.push({
              index: operation.index,
              path: operation.path,
              operation: operation.operation,
              status: "applied"
            });
            break;
          }
        }
      }
    } catch (error) {
      failed = true;
      errors.push(error instanceof Error ? error.message : String(error));
      const last = ops.filter((op) => op.status === "applied").at(-1);
      this.#recordCrashState(
        preparation,
        sandbox,
        last?.index ?? -1,
        beforeSnapshot,
        rollbackRecords
      );
    }

    let afterSnapshot = await sandbox.snapshot().catch(() => null);
    const diff = afterSnapshot
      ? diffSnapshots(beforeSnapshot, afterSnapshot, preparation.operations)
      : [];

    let rollbackFailed = false;
    if (failed || this.#cancelledRuns.has(preparation.runId)) {
      const rollbackResult = await this.#rollbackInSandbox(
        preparation.runId,
        sandbox,
        rollbackRecords,
        beforeSnapshot
      );
      rollbackFailed = rollbackResult.status === "rollback-failed";
      if (rollbackFailed) errors.push(...rollbackResult.errors);
      // Report the final sandbox state after rollback, not the failed
      // intermediate state used to produce the attempted diff.
      afterSnapshot = await sandbox.snapshot().catch(() => null);
    }

    await sandbox.close().catch(() => undefined);

    const completedAt = new Date(this.#now()).toISOString();
    const cancelled = this.#cancelledRuns.has(preparation.runId);
    const status = cancelled
      ? "cancelled"
      : rollbackFailed
        ? "rollback-failed"
        : failed
          ? "rolled-back"
          : "applied";

    const result: ApplyResult = {
      schemaVersion: "1.0.0-draft.1",
      contractKind: "apply-result",
      runId: preparation.runId,
      status,
      startedAt,
      completedAt,
      executionPlanId: preparation.executionPlanId,
      executionPlanDigest: preparation.executionPlanDigest,
      sandboxId: input.sandboxId,
      beforeSnapshotDigest: beforeSnapshot.digest,
      afterSnapshotDigest: afterSnapshot?.digest ?? null,
      diff,
      rollback: rollbackRecords,
      operations: ops,
      cancelled,
      recoverable: !rollbackFailed,
      errors,
      evidence: []
    };

    await this.#emit({
      kind: "apply.completed",
      recordedAt: completedAt,
      runId: preparation.runId,
      redacted: true,
      detail: {
        status: result.status,
        appliedOperations: ops.filter((op) => op.status === "applied").length,
        diffEntries: diff.length,
        rollbackFailed
      }
    });

    return result;
  }

  async rollback(input: RollbackInput): Promise<RollbackResult> {
    const sandbox = await this.#createSandbox(input.sandboxId);
    const result = await this.#rollbackInSandbox(
      input.runId,
      sandbox,
      input.rollbackRecords,
      input.beforeSnapshotDigest
    );
    await sandbox.close().catch(() => undefined);
    return result;
  }

  async cancel(runId: string): Promise<void> {
    this.#cancelledRuns.add(runId);
    await this.#emit({
      kind: "apply.cancelled",
      recordedAt: new Date(this.#now()).toISOString(),
      runId,
      redacted: true
    });
  }

  recoveryRecord(runId: string): CrashStateRecord | null {
    return this.#crashStates.get(runId) ?? null;
  }

  #assertApplyEnabled(): void {
    if (this.#applyDisabled) {
      throw new ApplyError(
        "APPLY_DISABLED",
        "Apply is disabled. Public exposure requires coordinator review and approval."
      );
    }
  }

  #gate(
    gates: ApplyPreparation["gates"],
    code: string,
    check: () => void
  ): void {
    try {
      check();
      gates.push({ code, status: "passed", message: `Gate "${code}" passed.` });
    } catch (error) {
      gates.push({
        code,
        status: "failed",
        message: error instanceof Error ? error.message : `Gate "${code}" failed.`
      });
    }
  }

  async #captureBefore(
    sandbox: SandboxSession,
    path: string
  ): Promise<Uint8Array | null> {
    try {
      return await sandbox.read(path);
    } catch {
      return null;
    }
  }

  #recordCrashState(
    preparation: ApplyPreparation,
    sandbox: SandboxSession,
    lastOperationIndex: number,
    beforeSnapshot: SandboxSnapshot,
    rollbackRecords: RollbackRecordEntry[]
  ): void {
    const record: CrashStateRecord = {
      runId: preparation.runId,
      sandboxId: sandbox.id,
      executionPlanId: preparation.executionPlanId,
      executionPlanDigest: preparation.executionPlanDigest,
      startedAt: preparation.preparedAt,
      lastOperationIndex,
      operationsApplied: lastOperationIndex + 1,
      rollbackRecords: rollbackRecords.map((entry) => ({ ...entry })),
      beforeSnapshotDigest: beforeSnapshot.digest,
      recoverable: this.#rollbackContents.has(preparation.runId),
      recordedAt: new Date(this.#now()).toISOString()
    };
    this.#crashStates.set(preparation.runId, record);
    void this.#emit({
      kind: "apply.crash-state",
      recordedAt: record.recordedAt,
      runId: preparation.runId,
      redacted: true,
      detail: {
        lastOperationIndex: record.lastOperationIndex,
        operationsApplied: record.operationsApplied,
        recoverable: record.recoverable
      }
    });
  }

  async #rollbackInSandbox(
    runId: string,
    sandbox: SandboxSession,
    records: RollbackRecordEntry[],
    beforeSnapshot: SandboxSnapshot | string
  ): Promise<RollbackResult> {
    const beforeSnapshotDigest = typeof beforeSnapshot === "string" ? beforeSnapshot : beforeSnapshot.digest;
    const preExistingDirectories = new Set(
      typeof beforeSnapshot === "string"
        ? []
        : beforeSnapshot.entries.filter((entry) => entry.type === "directory").map((entry) => entry.path)
    );
    const ordered = [...records].sort(
      (left, right) => right.operationIndex - left.operationIndex
    );
    const priorContents = this.#rollbackContents.get(runId);
    let reverted = 0;
    let verified = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const record of ordered) {
      try {
        if (!priorContents?.has(record.operationIndex)) {
          throw new ApplyError(
            "APPLY_ROLLBACK_FAILED",
            `Missing rollback content for operation ${record.operationIndex}.`
          );
        }
        const prior = priorContents.get(record.operationIndex) ?? null;
        if (!record.reverted) {
          if (prior === null) {
            // A create operation had no prior file. Removal is idempotent so a
            // failed pre-write operation does not make rollback fail.
            await sandbox.remove(record.path).catch(() => undefined);
            // Remove only ancestors not represented in the before snapshot,
            // deepest first. Pre-existing directories are never removed.
            const parts = record.path.split("/");
            for (let end = parts.length - 1; end > 0; end -= 1) {
              const directory = parts.slice(0, end).join("/");
              if (!preExistingDirectories.has(directory)) {
                await sandbox.remove(directory).catch(() => undefined);
              }
            }
          } else {
            await sandbox.write(record.path, prior);
          }
          record.reverted = true;
          reverted += 1;
        }
        record.verified = true;
        verified += 1;
      } catch (error) {
        record.error = error instanceof Error ? error.message : String(error);
        failed += 1;
        errors.push(record.error);
      }
    }

    let verifiedDigest: `${string}` | null = null;
    try {
      const after = await sandbox.snapshot();
      verifiedDigest = after.digest === beforeSnapshotDigest ? (after.digest as `${string}`) : null;
    } catch {
      verifiedDigest = null;
    }
    if (verifiedDigest === null) {
      failed += 1;
      errors.push(
        `Rollback snapshot does not match the before-state digest ${beforeSnapshotDigest}.`
      );
    }

    await this.#emit({
      kind: "apply.rollback",
      recordedAt: new Date(this.#now()).toISOString(),
      runId,
      redacted: true,
      detail: { reverted, verified, failed }
    });

    const status =
      failed > 0
        ? "rollback-failed"
        : reverted > 0
          ? "rolled-back"
          : "not-needed";
    return { runId, status, reverted, verified, failed, errors, verifiedDigest: verifiedDigest as `${string}` | null };
  }

  async #createSandbox(sandboxId: string, runId?: string): Promise<SandboxSession> {
    if (this.#sandboxProvider === undefined) {
      throw new ApplyError("APPLY_INPUT_INVALID", `No sandbox provider configured for ${sandboxId}.`);
    }
    const stored = runId === undefined ? undefined : this.#preparations.get(runId);
    const policy = stored?.input.sandboxPolicy;
    if (policy === undefined) {
      throw new ApplyError("APPLY_INPUT_INVALID", "Sandbox policy is unavailable.");
    }
    return this.#sandboxProvider.create({ policy, root: `/sandbox/${sandboxId}`, sandboxId });
  }

  async #emit(event: ApplyEvidenceEvent): Promise<void> {
    await this.#evidenceSink.record(event);
  }
}

function assertOperationAllowedGate(
  preparation: ApplyPreparation,
  operation: ApplyPreparation["operations"][number]
): void {
  const gate = preparation.gates.find(
    (candidate) => candidate.code === `operation.${operation.index}`
  );
  if (gate === undefined || gate.status !== "passed") {
    throw new ApplyError(
      "APPLY_NOT_READY",
      `Operation gate for ${operation.path} is not passed.`
    );
  }
}

function digestBytes(content: Uint8Array): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function diffSnapshots(
  before: SandboxSnapshot,
  after: SandboxSnapshot,
  operations: ApplyPreparation["operations"]
): ApplyDiffEntry[] {
  const beforeByPath = new Map(before.entries.map((entry) => [entry.path, entry.digest]));
  const afterByPath = new Map(after.entries.map((entry) => [entry.path, entry.digest]));
  const allPaths = new Set([...beforeByPath.keys(), ...afterByPath.keys()]);
  const operationByPath = new Map(
    operations.map((operation) => [operation.path, operation.operation])
  );
  const diff: ApplyDiffEntry[] = [];
  for (const p of allPaths) {
    const beforeDigest = beforeByPath.get(p) ?? null;
    const afterDigest = afterByPath.get(p) ?? null;
    if (beforeDigest === afterDigest) continue;
    const kind: ApplyDiffEntry["kind"] =
      beforeDigest === null ? "created" : afterDigest === null ? "removed" : "modified";
    diff.push({
      path: p,
      kind,
      beforeDigest,
      afterDigest,
      operation: operationByPath.get(p) ?? "unknown"
    });
  }
  return diff.sort((left, right) => left.path.localeCompare(right.path));
}