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

function validSkill(metadataVersionKey = "version"): string {
  return `---
name: web-platform
description: "Use when browser-native animation fully satisfies the request."
license: LicenseRef-Soren-SDK-Internal
compatibility: Soren SDK Phase 4; browser-native runtime; no executable scripts
metadata:
  publisher: soren-sdk
  ${metadataVersionKey}: 1.0.0
source: ./docs.sources.json
source-digest: ${WEB_PLATFORM_SOURCE_DIGEST}
---

# Web Platform Routing Skill
`;
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

  it("accepts valid YAML with nested publisher and version metadata", async () => {
    const root = await createSkillFixture(validSkill());
    try {
      const report = validateRepository(root);
      expect(report.errors).toEqual([]);
      expect(report.validatedConnectors).toEqual(["web-platform"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("accepts apostrophes inside valid plain YAML scalars", async () => {
    const root = await createSkillFixture(`---
name: web-platform
description: Use when it's needed for browser-native animation.
license: LicenseRef-Soren-SDK-Internal
compatibility: Soren SDK Phase 4; browser-native runtime; no executable scripts
metadata:
  publisher: soren-sdk
  version: 1.0.0
source: ./docs.sources.json
source-digest: ${WEB_PLATFORM_SOURCE_DIGEST}
---

# Web Platform Routing Skill
`);
    try {
      const report = validateRepository(root);
      expect(report.errors).toEqual([]);
      expect(report.validatedConnectors).toEqual(["web-platform"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["folded", ">-"],
    ["literal", "|-"]
  ])("accepts a valid %s YAML block scalar", async (_name, indicator) => {
    const root = await createSkillFixture(`---
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
source-digest: ${WEB_PLATFORM_SOURCE_DIGEST}
---

# Web Platform Routing Skill
`);
    try {
      const report = validateRepository(root);
      expect(report.errors).toEqual([]);
      expect(report.validatedConnectors).toEqual(["web-platform"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("accepts the documented metadata.connector-version key", async () => {
    const root = await createSkillFixture(validSkill("connector-version"));
    try {
      const report = validateRepository(root);
      expect(report.errors).toEqual([]);
      expect(report.validatedConnectors).toEqual(["web-platform"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(["1.2.3-01", "1.2.3-.."]) (
    "rejects an invalid semantic version in Skill metadata: %s",
    async (version) => {
      const root = await createSkillFixture(`---
name: web-platform
description: Use when browser-native animation fully satisfies the request.
license: LicenseRef-Soren-SDK-Internal
compatibility: Soren SDK Phase 4; browser-native runtime; no executable scripts
metadata:
  publisher: soren-sdk
  connector-version: ${version}
source: ./docs.sources.json
source-digest: ${WEB_PLATFORM_SOURCE_DIGEST}
---

# Web Platform Routing Skill
`);
      try {
        const report = validateRepository(root);
        expect(report.errors.flatMap((failure) => failure.issues)).toContainEqual(
          expect.objectContaining({ keyword: "skill-metadata-version" })
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );

  it("rejects malformed YAML such as an unterminated quoted scalar", async () => {
    const root = await createSkillFixture(`---
name: web-platform
description: Use when browser-native animation fully satisfies the request.
license: "unterminated
compatibility: Soren SDK Phase 4; browser-native runtime; no executable scripts
metadata:
  publisher: soren-sdk
  version: 1.0.0
source: ./docs.sources.json
source-digest: ${WEB_PLATFORM_SOURCE_DIGEST}
---

# Web Platform Routing Skill
`);
    try {
      const report = validateRepository(root);
      expect(report.errors.flatMap((failure) => failure.issues)).toContainEqual(
        expect.objectContaining({ keyword: "skill-frontmatter" })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects an unquoted plain scalar containing colon-space", async () => {
    const root = await createSkillFixture(`---
name: web-platform
description: Use when routing: for browser-native animation.
license: LicenseRef-Soren-SDK-Internal
compatibility: Soren SDK Phase 4; browser-native runtime; no executable scripts
metadata:
  publisher: soren-sdk
  version: 1.0.0
source: ./docs.sources.json
source-digest: ${WEB_PLATFORM_SOURCE_DIGEST}
---

# Web Platform Routing Skill
`);
    try {
      const report = validateRepository(root);
      expect(report.errors.flatMap((failure) => failure.issues)).toContainEqual(
        expect.objectContaining({ keyword: "skill-frontmatter" })
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(["- Use when routing", "? Use when routing"])(
    "rejects an indicator-prefixed plain scalar: %s",
    async (description) => {
      const root = await createSkillFixture(`---
name: web-platform
description: ${description}
license: LicenseRef-Soren-SDK-Internal
compatibility: Soren SDK Phase 4; browser-native runtime; no executable scripts
metadata:
  publisher: soren-sdk
  version: 1.0.0
source: ./docs.sources.json
source-digest: ${WEB_PLATFORM_SOURCE_DIGEST}
---

# Web Platform Routing Skill
`);
      try {
        const report = validateRepository(root);
        expect(report.errors.flatMap((failure) => failure.issues)).toContainEqual(
          expect.objectContaining({ keyword: "skill-frontmatter" })
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );

  it.each(["0x10", "0o20", "0b10000"])(
    "rejects non-decimal YAML numerics in required string fields: %s",
    async (license) => {
      const root = await createSkillFixture(`---
name: web-platform
description: Use when browser-native animation fully satisfies the request.
license: ${license}
compatibility: Soren SDK Phase 4; browser-native runtime; no executable scripts
metadata:
  publisher: soren-sdk
  version: 1.0.0
source: ./docs.sources.json
source-digest: ${WEB_PLATFORM_SOURCE_DIGEST}
---

# Web Platform Routing Skill
`);
      try {
        const report = validateRepository(root);
        expect(report.errors.flatMap((failure) => failure.issues)).toContainEqual(
          expect.objectContaining({ keyword: "skill-license" })
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );

  it("rejects a skill whose source registry digest does not match", async () => {
    const root = await createSkillFixture(`---
name: web-platform
description: Use when browser-native animation fully satisfies the request.
license: LicenseRef-Soren-SDK-Internal
compatibility: Soren SDK Phase 4; browser-native runtime; no executable scripts
metadata:
  publisher: soren-sdk
  version: 1.0.0
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
