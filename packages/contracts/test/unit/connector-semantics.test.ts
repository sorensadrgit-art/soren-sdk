import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  validateCapabilityCatalog,
  validateConnectorManifest
} from "../../src/index.js";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures"
);

function fixture(folder: "invalid" | "valid", name: string): unknown {
  return JSON.parse(
    readFileSync(join(fixtureRoot, folder, name), "utf8")
  ) as unknown;
}

function validateInvalid(name: string) {
  const catalogResult = validateCapabilityCatalog(
    fixture("valid", "capability-catalog.json")
  );
  if (!catalogResult.ok) {
    throw new Error("The capability catalog fixture must be valid.");
  }

  return validateConnectorManifest(fixture("invalid", name), {
    expectedPublisher: "soren-sdk",
    capabilityCatalog: catalogResult.value
  });
}

describe("connector semantic validation", () => {
  it.each([
    ["prose-version-placeholder.json", "version-placeholder"],
    ["publisher-mismatch.json", "publisher"],
    ["missing-license.json", "required"],
    ["remote-mcp-missing-network.json", "remote-network-scope"],
    ["selectable-with-blockers.json", "selectable-blockers"],
    ["ownership-conflict.json", "ownership-conflict"]
  ])("rejects %s", (name, expectedKeyword) => {
    const result = validateInvalid(name);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.keyword === expectedKeyword)).toBe(true);
    }
  });

  it("accepts the valid Web Platform connector", () => {
    const catalogResult = validateCapabilityCatalog(
      fixture("valid", "capability-catalog.json")
    );
    if (!catalogResult.ok) {
      throw new Error("The capability catalog fixture must be valid.");
    }

    expect(
      validateConnectorManifest(fixture("valid", "connector.json"), {
        expectedPublisher: "soren-sdk",
        capabilityCatalog: catalogResult.value
      }).ok
    ).toBe(true);
  });
});
