import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { validateRepository } from "../../src/cli/validate-repository.js";

function repositoryRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

async function createSkillFixture(skill: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "soren-sdk-skill-validation-"));
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
  await writeFile(join(connector, "SKILL.md"), skill, "utf8");
  return root;
}

describe("connector Agent Skill validation", () => {
  it("rejects a present skill without required YAML frontmatter", async () => {
    const root = await createSkillFixture("# Missing frontmatter\n");
    try {
      const report = validateRepository(root);
      expect(report.errors.flatMap((failure) => failure.issues)).toContainEqual(
        expect.objectContaining({ keyword: "skill-frontmatter" })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a skill whose source registry digest does not match", async () => {
    const root = await createSkillFixture(`---
name: web-platform
description: Use when browser-native animation fully satisfies the request.
license: LicenseRef-Soren-SDK-Internal
compatibility: Soren SDK Phase 4; browser-native runtime; no executable scripts
source: ./docs.sources.json
source-digest: sha256:${"0".repeat(64)}
---

# Web Platform Routing Skill
`);
    try {
      const report = validateRepository(root);
      expect(report.errors.flatMap((failure) => failure.issues)).toContainEqual(
        expect.objectContaining({ keyword: "skill-source-digest" })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
