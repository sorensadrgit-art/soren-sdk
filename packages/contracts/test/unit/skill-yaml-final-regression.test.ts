import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { validateRepository } from "../../src/cli/validate-repository.js";

function repositoryRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

async function createFixture(license: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "soren-sdk-skill-single-quote-"));
  const connector = join(root, "sdk-connectors", "web-platform");
  await mkdir(join(root, "capabilities"), { recursive: true });
  await mkdir(connector, { recursive: true });

  await writeFile(
    join(root, "capabilities", "catalog.json"),
    await readFile(join(repositoryRoot(), "capabilities", "catalog.json"), "utf8"),
    "utf8"
  );
  for (const file of ["sdk.manifest.json", "docs.sources.json"]) {
    await writeFile(
      join(connector, file),
      await readFile(
        join(repositoryRoot(), "sdk-connectors", "web-platform", file),
        "utf8"
      ),
      "utf8"
    );
  }
  await writeFile(
    join(connector, "SKILL.md"),
    `---
name: web-platform
description: "Use when browser-native animation fully satisfies the request."
license: ${license}
compatibility: Soren SDK Phase 4; browser-native runtime; no executable scripts
metadata:
  publisher: soren-sdk
  version: 1.0.0
source: ./docs.sources.json
source-digest: sha256:8a1f03a2689222031b57186f7172ccae7697037462f688c6576f3a50241016d7
---

# Web Platform Routing Skill
`,
    "utf8"
  );
  return root;
}

async function expectRejected(license: string): Promise<void> {
  const root = await createFixture(license);
  try {
    const report = validateRepository(root);
    expect(report.errors.flatMap((failure) => failure.issues)).toContainEqual(
      expect.objectContaining({ keyword: "skill-frontmatter" })
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("strict single-quoted YAML scalars", () => {
  it("rejects an unescaped interior single quote", async () => {
    await expectRejected("'MIT' garbage'");
  });

  it("rejects trailing text between balanced single-quoted scalars", async () => {
    await expectRejected("'MIT' garbage 'foo'");
  });
});
