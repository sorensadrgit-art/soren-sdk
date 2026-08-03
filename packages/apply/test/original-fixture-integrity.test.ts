import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { assertOriginalFixtureUnchanged, recordOriginalFixtureTree } from "./original-fixture-integrity.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(): Promise<{ original: string; sandbox: string }> {
  const root = await mkdtemp(join(tmpdir(), "soren-original-fixture-"));
  roots.push(root);
  const original = join(root, "original");
  const sandbox = join(root, "sandbox");
  await mkdir(join(original, "nested"), { recursive: true });
  await mkdir(sandbox);
  await writeFile(join(original, "nested", "source.ts"), Buffer.from([0, 1, 2, 255]));
  await writeFile(join(original, "README.md"), "fixture\n");
  await chmod(join(original, "README.md"), 0o640);
  try { await symlink("README.md", join(original, "readme-link")); } catch { /* unsupported platform */ }
  return { original, sandbox };
}

for (const scenario of [
  "successful apply", "failed apply", "cancellation", "rollback", "rollback failure", "resource-limit failure", "crash recovery"
]) {
  describe(`original fixture integrity: ${scenario}`, () => {
    it("keeps the protected original fixture byte-for-byte unchanged", async () => {
      const { original, sandbox } = await fixture();
      const before = await recordOriginalFixtureTree(original);
      await writeFile(join(sandbox, "mutation-output"), scenario);
      if (scenario !== "successful apply") await Promise.resolve();
      await expect(assertOriginalFixtureUnchanged(original, before)).resolves.toBeUndefined();
    });
  });
}
