import { readFileSync, writeFileSync } from "node:fs";

const path = "packages/apply/src/apply-service.ts";
const source = readFileSync(path, "utf8");
const before = `        const prior = await this.#captureBefore(sandbox, operation.path);
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
                \`Content for \${operation.path} does not match the immutable plan digest.\`,
                { path: operation.path }
              );
            }
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
                \`Cannot delete \${operation.path}: file does not exist.\`,
                { path: operation.path }
              );
            }
            await sandbox.remove(operation.path);
            ops.push({
              index: operation.index,
              path: operation.path,
              operation: operation.operation,
              status: "applied"
            });
            break;
          }
        }`;
const after = `        const prior = await this.#captureBefore(sandbox, operation.path);
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
                \`Content for \${operation.path} does not match the immutable plan digest.\`,
                { path: operation.path }
              );
            }
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
                \`Cannot delete \${operation.path}: file does not exist.\`,
                { path: operation.path }
              );
            }
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
        }`;

if (!source.includes(before)) {
  throw new Error("Expected Phase 9 mutation block was not found; refusing to patch.");
}
const updated = source.replace(before, after);
if (updated === source || updated.includes(before)) {
  throw new Error("Phase 9 mutation-boundary patch did not apply exactly once.");
}
writeFileSync(path, updated);
