import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  validateCapabilityCatalog,
  validateConnectorManifest,
  type ConnectorManifest,
  type IntegrationArtifact
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

function capabilityCatalog() {
  const result = validateCapabilityCatalog(
    fixture("valid", "capability-catalog.json")
  );
  if (!result.ok) throw new Error("Capability fixture must be valid.");
  return result.value;
}

function connectorWithSkill(
  source: string,
  version: ConnectorManifest["integrations"][number]["version"],
  dataExposure: IntegrationArtifact["dataExposure"] = "remote-source",
  network: string[] = ["example.com"]
): ConnectorManifest {
  const connector = structuredClone(
    fixture("valid", "connector.json")
  ) as ConnectorManifest;
  connector.integrations.push({
    id: "fixture-agent-skill",
    kind: "agent-skill",
    mode: "knowledge",
    status: "available",
    source,
    version,
    authorization: {
      required: false,
      method: "none",
      paidPlan: false
    },
    executionRisk: "read-only",
    dataExposure,
    permissions: {
      filesystem: "none",
      network,
      projectWrite: false
    },
    licenseExpression: "MIT",
    fallback: null
  });
  return connector;
}

function validate(connector: ConnectorManifest) {
  return validateConnectorManifest(connector, {
    expectedPublisher: "soren-sdk",
    capabilityCatalog: capabilityCatalog()
  });
}

describe("Agent Skill pin regressions", () => {
  it("rejects an arbitrary hash-shaped URL component without explicit pin metadata", () => {
    const result = validate(
      connectorWithSkill(
        `https://example.com/skills/${"a".repeat(40)}/latest`,
        { status: "resolved", value: "1.2.3" }
      )
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ keyword: "available-agent-skill-pin" })
      );
    }
  });

  it.each([
    ["commit", { status: "resolved" as const, value: "1.2.3", commit: "a".repeat(40) }],
    [
      "digest",
      {
        status: "resolved" as const,
        value: "1.2.3",
        digest: `sha256:${"b".repeat(64)}` as `sha256:${string}`
      }
    ]
  ])("accepts an explicit immutable %s pin on a mutable source URL", (_name, version) => {
    expect(
      validate(
        connectorWithSkill(
          "https://example.com/skills/latest",
          version
        )
      ).ok
    ).toBe(true);
  });

  it("requires an immutable pin for an available local file-backed skill", () => {
    const result = validate(
      connectorWithSkill(
        "file:///opt/soren/skills/example/SKILL.md",
        { status: "resolved", value: "1.2.3" },
        "local-only",
        []
      )
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ keyword: "available-agent-skill-pin" })
      );
    }
  });

  it("accepts a local file-backed skill with an explicit digest pin", () => {
    expect(
      validate(
        connectorWithSkill(
          "file:///opt/soren/skills/example/SKILL.md",
          {
            status: "resolved",
            value: "1.2.3",
            digest: `sha256:${"c".repeat(64)}` as `sha256:${string}`
          },
          "local-only",
          []
        )
      ).ok
    ).toBe(true);
  });
});
