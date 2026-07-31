import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  digestJson,
  type JsonValue
} from "../../src/index.js";
import { validateRepository } from "../../src/cli/validate-repository.js";

function repositoryRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

async function copyRepositoryFixture(root: string): Promise<string> {
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
  return connector;
}

function skill(sourceDigest: string, description: string): string {
  return `---
name: web-platform
description: ${description}
license: LicenseRef-Soren-SDK-Internal
compatibility: Soren SDK Phase 4; browser-native runtime; no executable scripts
metadata:
  publisher: soren-sdk
  version: 1.0.0
source: ./docs.sources.json
source-digest: ${sourceDigest}
---

# Web Platform Routing Skill
`;
}

describe("Skill YAML and source-scope security regressions", () => {
  it("accepts YAML-specific hexadecimal escapes in double-quoted scalars", async () => {
    const root = await mkdtemp(join(tmpdir(), "soren-sdk-yaml-escape-"));
    try {
      const connector = await copyRepositoryFixture(root);
      const source = JSON.parse(
        await readFile(
          join(repositoryRoot(), "sdk-connectors", "web-platform", "docs.sources.json"),
          "utf8"
        )
      ) as JsonValue;
      const digest = digestJson(source);
      await writeFile(
        join(connector, "docs.sources.json"),
        JSON.stringify(source),
        "utf8"
      );
      await writeFile(
        join(connector, "SKILL.md"),
        skill(digest, '"Use when\\x20needed for browser-native animation."'),
        "utf8"
      );

      const report = validateRepository(root);
      expect(report.errors).toEqual([]);
      expect(report.validatedConnectors).toEqual(["web-platform"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects connector-local source symlinks that resolve outside the connector", async () => {
    const root = await mkdtemp(join(tmpdir(), "soren-sdk-symlink-scope-"));
    const outside = await mkdtemp(join(tmpdir(), "soren-sdk-outside-source-"));
    try {
      const connector = await copyRepositoryFixture(root);
      const source = { outside: true } satisfies JsonValue;
      const digest = digestJson(source);
      const outsidePath = join(outside, "docs.sources.json");
      await writeFile(outsidePath, JSON.stringify(source), "utf8");
      await symlink(outsidePath, join(connector, "docs.sources.json"));
      await writeFile(
        join(connector, "SKILL.md"),
        skill(digest, "Use when browser-native animation fully satisfies the request."),
        "utf8"
      );

      const report = validateRepository(root);
      expect(report.errors.flatMap((failure) => failure.issues)).toContainEqual(
        expect.objectContaining({ keyword: "skill-source" })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
