import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { digestJson, type JsonValue } from "../../src/index.js";
import { validateRepository } from "../../src/cli/validate-repository.js";

function repositoryRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

async function createFixture(frontmatter: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "soren-sdk-yaml-floats-"));
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
  const source = JSON.parse(
    await readFile(
      join(repositoryRoot(), "sdk-connectors", "web-platform", "docs.sources.json"),
      "utf8"
    )
  ) as JsonValue;
  await writeFile(join(connector, "docs.sources.json"), JSON.stringify(source), "utf8");
  await writeFile(
    join(connector, "SKILL.md"),
    `---
${frontmatter}
source: ./docs.sources.json
source-digest: ${digestJson(source)}
---

# Web Platform Routing Skill
`,
    "utf8"
  );
  return root;
}

const BASE_FRONTMATTER = `name: web-platform
description: Use when browser-native animation fully satisfies the request.
license: LicenseRef-Soren-SDK-Internal
compatibility: Soren SDK Phase 4; browser-native runtime; no executable scripts
metadata:
  publisher: soren-sdk
  version: 1.0.0`;

describe("Skill YAML floating-point scalars", () => {
  it.each([
    ["license", ".5", "skill-license"],
    ["compatibility", "5.", "skill-compatibility"],
    ["description", "1.2e3", "skill-description"]
  ])("rejects numeric scalar %s=%s in string fields", async (field, scalar, keyword) => {
    const frontmatter = BASE_FRONTMATTER.split("\n")
      .map((line) =>
        line.startsWith(`${field}:`) ? `${field}: ${scalar}` : line
      )
      .join("\n");
    const root = await createFixture(frontmatter);
    try {
      const report = validateRepository(root);
      expect(report.errors.flatMap((failure) => failure.issues)).toContainEqual(
        expect.objectContaining({ keyword })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
