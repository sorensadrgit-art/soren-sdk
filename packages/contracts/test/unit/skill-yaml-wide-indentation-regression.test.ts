import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { validateRepository } from "../../src/cli/validate-repository.js";

const WEB_PLATFORM_SOURCE_DIGEST =
  "sha256:8a1f03a2689222031b57186f7172ccae7697037462f688c6576f3a50241016d7";

function repositoryRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "soren-sdk-yaml-wide-indent-"));
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
description: Use when browser-native animation fully satisfies the request.
license: LicenseRef-Soren-SDK-Internal
compatibility: Soren SDK Phase 4; browser-native runtime; no executable scripts
metadata:
    publisher: soren-sdk
    connector-version: 1.0.0
source: ./docs.sources.json
source-digest: ${WEB_PLATFORM_SOURCE_DIGEST}
---

# Web Platform Routing Skill
`,
    "utf8"
  );
  return root;
}

describe("Skill YAML wider indentation", () => {
  it("accepts a consistently four-space nested mapping", async () => {
    const root = await createFixture();
    try {
      const report = validateRepository(root);
      expect(report.errors).toEqual([]);
      expect(report.validatedConnectors).toEqual(["web-platform"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
