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
  const root = await mkdtemp(join(tmpdir(), "soren-sdk-yaml-audit-round2-"));
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
    `---\n${frontmatter}\nsource: ./docs.sources.json\nsource-digest: ${digestJson(source)}\n---\n\n# Web Platform Routing Skill\n`,
    "utf8"
  );
  return root;
}

function frontmatter(overrides: { description?: string; license?: string } = {}): string {
  return [
    "name: web-platform",
    `description: ${overrides.description ?? "Use when browser-native animation fully satisfies the request."}`,
    `license: ${overrides.license ?? "LicenseRef-Soren-SDK-Internal"}`,
    "compatibility: Soren SDK Phase 4; browser-native runtime; no executable scripts",
    "metadata:",
    "  publisher: soren-sdk",
    "  version: 1.0.0"
  ].join("\n");
}

describe("quoted Skill YAML project audit regressions", () => {
  it("accepts a literal tab inside a double-quoted scalar", async () => {
    const root = await createFixture(
      frontmatter({
        description: '"Use when\tbrowser-native animation fully satisfies the request."'
      })
    );
    try {
      const report = validateRepository(root);
      expect(report.errors).toEqual([]);
      expect(report.validatedConnectors).toEqual(["web-platform"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects trailing content after a double-quoted scalar", async () => {
    const root = await createFixture(
      frontmatter({ license: '"MIT"junk"' })
    );
    try {
      const report = validateRepository(root);
      expect(report.errors.flatMap((failure) => failure.issues)).toContainEqual(
        expect.objectContaining({ keyword: "skill-frontmatter" })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("accepts a safe scalar flow sequence in optional metadata", async () => {
    const root = await createFixture(
      frontmatter().replace(
        "  version: 1.0.0",
        "  version: 1.0.0\n  tags: [animation, accessibility]"
      )
    );
    try {
      const report = validateRepository(root);
      expect(report.errors).toEqual([]);
      expect(report.validatedConnectors).toEqual(["web-platform"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
