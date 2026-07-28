import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { validateRepository } from "../../src/cli/validate-repository.js";

describe("repository contract validation", () => {
  it("validates Schema v2 artifacts and reports legacy planning manifests", () => {
    const repositoryRoot = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../.."
    );

    const report = validateRepository(repositoryRoot);

    expect(report.errors).toEqual([]);
    expect(report.validatedConnectors).toContain("web-platform");
    expect(report.warnings.length).toBeGreaterThan(0);
  });
});
