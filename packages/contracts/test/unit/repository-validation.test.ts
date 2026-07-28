import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { validateRepository } from "../../src/cli/validate-repository.js";

function repositoryRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

async function createTemporaryRepository(
  manifestContent?: string
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "soren-sdk-contracts-"));
  await mkdir(join(root, "capabilities"), { recursive: true });
  await mkdir(join(root, "sdk-connectors", "broken"), { recursive: true });

  const capabilityCatalog = await readFile(
    join(repositoryRoot(), "capabilities", "catalog.json"),
    "utf8"
  );
  await writeFile(
    join(root, "capabilities", "catalog.json"),
    capabilityCatalog,
    "utf8"
  );

  if (manifestContent !== undefined) {
    await writeFile(
      join(root, "sdk-connectors", "broken", "sdk.manifest.json"),
      manifestContent,
      "utf8"
    );
  }

  return root;
}

describe("repository contract validation", () => {
  it("validates Schema v2 artifacts and reports legacy planning manifests", () => {
    const report = validateRepository(repositoryRoot());

    expect(report.errors).toEqual([]);
    expect(report.validatedConnectors).toContain("web-platform");
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it("reports malformed connector manifest JSON", async () => {
    const root = await createTemporaryRepository("{ invalid json");

    try {
      const report = validateRepository(root);

      expect(report.errors).toHaveLength(1);
      expect(report.errors[0]?.issues[0]?.keyword).toBe("manifest-json");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports connector directories with a missing manifest", async () => {
    const root = await createTemporaryRepository();

    try {
      const report = validateRepository(root);

      expect(report.errors).toHaveLength(1);
      expect(report.errors[0]?.issues[0]?.keyword).toBe("manifest-read");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
