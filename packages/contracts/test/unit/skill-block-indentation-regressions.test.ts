import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { validateRepository } from "../../src/cli/validate-repository.js";

const SOURCE_DIGEST =
  "sha256:8a1f03a2689222031b57186f7172ccae7697037462f688c6576f3a50241016d7";

function repositoryRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

async function createFixture(indicator: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "soren-sdk-block-indent-"));
  const connector = join(root, "sdk-connectors", "web-platform");
  await mkdir(join(root, "capabilities"), { recursive: true });
  await mkdir(connector, { recursive: true });
  await writeFile(
    join(root, "capabilities", "catalog.json"),
    await readFile(join(repositoryRoot(), "capabilities", "catalog.json"), "utf8"),
    "utf8"
  );
  await writeFile(
    join(connector, "sdk.manifest.json"),
    await readFile(
      join(repositoryRoot(), "sdk-connectors", "web-platform", "sdk.manifest.json"),
      "utf8"
    ),
    "utf8"
  );
  await writeFile(
    join(connector, "docs.sources.json"),
    await readFile(
      join(repositoryRoot(), "sdk-connectors", "web-platform", "docs.sources.json"),
      "utf8"
    ),
    "utf8"
  );
  await writeFile(
    join(connector, "SKILL.md"),
    `---
name: web-platform
description: ${indicator}
  Use when browser-native animation fully satisfies
  the requested capability.
license: LicenseRef-Soren-SDK-Internal
compatibility: Soren SDK Phase 4; browser-native runtime; no executable scripts
metadata:
  publisher: soren-sdk
  version: 1.0.0
source: ./docs.sources.json
source-digest: ${SOURCE_DIGEST}
---

# Web Platform Routing Skill
`,
    "utf8"
  );
  return root;
}

describe("Skill YAML block indentation indicators", () => {
  it.each([">2-", ">-2", "|2", "|+2", "|2+"])(
    "accepts a valid block scalar header: %s",
    async (indicator) => {
      const root = await createFixture(indicator);
      try {
        const report = validateRepository(root);
        expect(report.errors).toEqual([]);
        expect(report.validatedConnectors).toEqual(["web-platform"]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );
});
