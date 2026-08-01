import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ContractValidator,
  validateCapabilityCatalog,
  validateConnectorManifest,
  type ContractSchemaName
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

const validFixtures: Array<[ContractSchemaName, string]> = [
  ["capability-catalog", "capability-catalog.json"],
  ["catalog-snapshot", "catalog-snapshot.json"],
  ["connector", "connector.json"],
  ["error-envelope", "error-envelope.json"],
  ["evidence-envelope", "evidence-envelope.json"],
  ["execution-plan", "execution-plan.json"],
  ["policy", "policy.json"],
  ["project-snapshot", "project-snapshot.json"],
  ["route-plan", "route-plan.json"],
  ["route-request", "route-request.json"],
  ["soren-config", "soren-config.json"],
  ["soren-sdk-lock", "soren-sdk-lock.json"]
];

describe("ContractValidator", () => {
  it("compiles every Draft 2020-12 schema", () => {
    expect(() => new ContractValidator()).not.toThrow();
  });

  it.each(validFixtures)("accepts the valid %s fixture", (schema, name) => {
    const validator = new ContractValidator();
    expect(validator.validate(schema, fixture("valid", name))).toEqual(
      expect.objectContaining({ ok: true })
    );
  });

  it("rejects unknown fields", () => {
    const result = validateConnectorManifest(
      fixture("invalid", "unknown-field.json")
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.keyword === "additionalProperties")).toBe(true);
    }
  });

  it("rejects a schema-version mismatch", () => {
    const validator = new ContractValidator();
    const result = validator.validate(
      "route-plan",
      fixture("invalid", "route-plan-version.json")
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.keyword === "const")).toBe(true);
    }
  });

  it("rejects unknown fields in soren-config", () => {
    const validator = new ContractValidator();
    const result = validator.validate(
      "soren-config",
      fixture("invalid", "soren-config-unknown-field.json")
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((issue) => issue.keyword === "additionalProperties")
      ).toBe(true);
    }
  });

  it("validates the capability catalog through its public helper", () => {
    expect(
      validateCapabilityCatalog(fixture("valid", "capability-catalog.json")).ok
    ).toBe(true);
  });
});
