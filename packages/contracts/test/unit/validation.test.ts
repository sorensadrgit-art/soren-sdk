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

  it("rejects a soren-sdk-lock missing the routePlanDigest", () => {
    const validator = new ContractValidator();
    const result = validator.validate(
      "soren-sdk-lock",
      fixture("invalid", "soren-sdk-lock-missing-route-plan-digest.json")
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.keyword === "required")).toBe(true);
    }
  });

  it("validates the capability catalog through its public helper", () => {
    expect(
      validateCapabilityCatalog(fixture("valid", "capability-catalog.json")).ok
    ).toBe(true);
  });

  it.each([
    ["missing evidenceId", (value: object) => Reflect.deleteProperty(value, "evidenceId")],
    ["malformed evidenceId", (value: object) => Reflect.set(value, "evidenceId", "evidence_wrong")],
    ["malformed digest", (value: object) => Reflect.set(value, "digest", "sha256:bad")],
    ["missing required field", (value: object) => Reflect.deleteProperty(value, "checks")],
    ["unknown top-level field", (value: object) => Reflect.set(value, "unknown", true)],
    ["wrong contract kind", (value: object) => Reflect.set(value, "contractKind", "wrong")],
    ["wrong schema version", (value: object) => Reflect.set(value, "schemaVersion", "2.0.0")],
    ["unknown check field", (value: object) => {
      const checks = Reflect.get(value, "checks");
      if (Array.isArray(checks) && checks[0] !== undefined) Reflect.set(checks[0], "unknown", true);
    }],
    ["malformed diagnostics", (value: object) => {
      const checks = Reflect.get(value, "checks");
      if (Array.isArray(checks) && checks[0] !== undefined) Reflect.set(checks[0], "diagnostics", [{}]);
    }],
    ["malformed artifact digest", (value: object) => {
      const checks = Reflect.get(value, "checks");
      if (Array.isArray(checks) && checks[0] !== undefined) Reflect.set(checks[0], "artifacts", ["bad"]);
    }],
    ["unsupported verification state", (value: object) => {
      const checks = Reflect.get(value, "checks");
      if (Array.isArray(checks) && checks[0] !== undefined) Reflect.set(checks[0], "status", "unknown");
    }]
  ])("rejects evidence with %s", (_name, mutate) => {
    const candidate = fixture("valid", "evidence-envelope.json");
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("Expected an object fixture.");
    }
    const evidence = structuredClone(candidate);
    mutate(evidence);
    expect(new ContractValidator().validate("evidence-envelope", evidence).ok).toBe(false);
  });
});
