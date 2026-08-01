import { readFileSync, writeFileSync } from "node:fs";

const path = "packages/apply/src/apply-service.ts";
let source = readFileSync(path, "utf8");

function replaceExact(before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`Expected exactly one audited fragment, found ${count}.`);
  }
  source = source.replace(before, after);
}

replaceExact(
  `  readonly #crashStates = new Map<string, CrashStateRecord>();\n  #applyDisabled = true;`,
  `  readonly #crashStates = new Map<string, CrashStateRecord>();\n  readonly #rollbackContents = new Map<\n    string,\n    Map<number, Uint8Array | null>\n  >();\n  #applyDisabled = true;`
);

replaceExact(
  `    if (this.#cancelledRuns.has(preparation.runId)) {\n      throw new ApplyError("APPLY_CANCELLED", \`Run \${preparation.runId} was cancelled.\`);\n    }\n\n    const startedAt = new Date(this.#now()).toISOString();`,
  `    if (this.#cancelledRuns.has(preparation.runId)) {\n      throw new ApplyError("APPLY_CANCELLED", \`Run \${preparation.runId} was cancelled.\`);\n    }\n    if (this.#usedApprovals.has(preparation.approvalNonce)) {\n      throw new ApplyError(\n        "APPLY_APPROVAL_REPLAYED",\n        \`Approval nonce \${preparation.approvalNonce} has already been used.\`\n      );\n    }\n    // Reserve the one-time approval before any asynchronous mutation work so\n    // concurrent apply calls cannot race with the same preparation.\n    this.#usedApprovals.add(preparation.approvalNonce);\n\n    const startedAt = new Date(this.#now()).toISOString();`
);

replaceExact(
  `    const rollbackRecords: RollbackRecordEntry[] = [];\n    const errors: string[] = [];`,
  `    const rollbackRecords: RollbackRecordEntry[] = [];\n    const rollbackContents = new Map<number, Uint8Array | null>();\n    this.#rollbackContents.set(preparation.runId, rollbackContents);\n    const errors: string[] = [];`
);

replaceExact(
  `        const prior = await this.#captureBefore(sandbox, operation.path);\n        rollbackRecords.push({`,
  `        const prior = await this.#captureBefore(sandbox, operation.path);\n        rollbackContents.set(\n          operation.index,\n          prior === null ? null : new Uint8Array(prior)\n        );\n        rollbackRecords.push({`
);

replaceExact(
  `      this.#recordCrashState(preparation, sandbox, last?.index ?? -1, beforeSnapshot);`,
  `      this.#recordCrashState(\n        preparation,\n        sandbox,\n        last?.index ?? -1,\n        beforeSnapshot,\n        rollbackRecords\n      );`
);

replaceExact(
  `    const afterSnapshot = await sandbox.snapshot().catch(() => null);`,
  `    let afterSnapshot = await sandbox.snapshot().catch(() => null);`
);

replaceExact(
  `      rollbackFailed = rollbackResult.status === "rollback-failed";\n      if (rollbackFailed) errors.push(...rollbackResult.errors);\n    }\n\n    await sandbox.close().catch(() => undefined);`,
  `      rollbackFailed = rollbackResult.status === "rollback-failed";\n      if (rollbackFailed) errors.push(...rollbackResult.errors);\n      // Report the final sandbox state after rollback, not the failed\n      // intermediate state used to produce the attempted diff.\n      afterSnapshot = await sandbox.snapshot().catch(() => null);\n    }\n\n    await sandbox.close().catch(() => undefined);`
);

replaceExact(
  `\n    this.#usedApprovals.add(input.preparation.approvalNonce);\n    return result;`,
  `\n    return result;`
);

replaceExact(
  `    lastOperationIndex: number,\n    beforeSnapshot: SandboxSnapshot\n  ): void {`,
  `    lastOperationIndex: number,\n    beforeSnapshot: SandboxSnapshot,\n    rollbackRecords: RollbackRecordEntry[]\n  ): void {`
);

replaceExact(
  `      rollbackRecords: [],\n      beforeSnapshotDigest: beforeSnapshot.digest,\n      recoverable: true,`,
  `      rollbackRecords: rollbackRecords.map((entry) => ({ ...entry })),\n      beforeSnapshotDigest: beforeSnapshot.digest,\n      recoverable: this.#rollbackContents.has(preparation.runId),`
);

replaceExact(
  `    const ordered = [...records].sort(\n      (left, right) => right.operationIndex - left.operationIndex\n    );`,
  `    const ordered = [...records].sort(\n      (left, right) => right.operationIndex - left.operationIndex\n    );\n    const priorContents = this.#rollbackContents.get(runId);`
);

replaceExact(
  `        if (!record.reverted) {\n          await sandbox.remove(record.path).catch(() => undefined);\n          record.reverted = true;\n          reverted += 1;\n        }\n        record.verified = true;\n        verified += 1;`,
  `        if (!priorContents?.has(record.operationIndex)) {\n          throw new ApplyError(\n            "APPLY_ROLLBACK_FAILED",\n            \`Missing rollback content for operation \${record.operationIndex}.\`\n          );\n        }\n        const prior = priorContents.get(record.operationIndex) ?? null;\n        if (!record.reverted) {\n          if (prior === null) {\n            // A create operation had no prior file. Removal is idempotent so a\n            // failed pre-write operation does not make rollback fail.\n            await sandbox.remove(record.path).catch(() => undefined);\n          } else {\n            await sandbox.write(record.path, prior);\n          }\n          record.reverted = true;\n          reverted += 1;\n        }\n        record.verified = true;\n        verified += 1;`
);

replaceExact(
  `    } catch {\n      verifiedDigest = null;\n    }\n\n    await this.#emit({`,
  `    } catch {\n      verifiedDigest = null;\n    }\n    if (verifiedDigest === null) {\n      failed += 1;\n      errors.push(\n        \`Rollback snapshot does not match the before-state digest \${beforeSnapshotDigest}.\`\n      );\n    }\n\n    await this.#emit({`
);

writeFileSync(path, source, "utf8");
