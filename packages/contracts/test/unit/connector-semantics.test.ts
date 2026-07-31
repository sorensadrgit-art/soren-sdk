import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  validateCapabilityCatalog,
  validateConnectorManifest,
  type ConnectorManifest
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
  const catalogResult = validateCapabilityCatalog(
    fixture("valid", "capability-catalog.json")
  );
  if (!catalogResult.ok) {
    throw new Error("The capability catalog fixture must be valid.");
  }
  return catalogResult.value;
}

function validateInvalid(name: string) {
  return validateConnectorManifest(fixture("invalid", name), {
    expectedPublisher: "soren-sdk",
    capabilityCatalog: capabilityCatalog()
  });
}

function connectorWithMcpProtocolVersions(
  supportedVersions: string[]
): ConnectorManifest {
  const connector = structuredClone(
    fixture("valid", "connector.json")
  ) as ConnectorManifest;
  connector.integrations.push({
    id: "fixture-mcp",
    kind: "mcp-server",
    mode: "tool",
    status: "available",
    source: "https://example.test/mcp",
    version: { status: "resolved", value: "1.0.0" },
    protocol: {
      name: "mcp",
      supportedVersions,
      extensions: []
    },
    authorization: {
      required: false,
      method: "none",
      paidPlan: false
    },
    executionRisk: "read-only",
    dataExposure: "remote-metadata",
    permissions: {
      filesystem: "none",
      network: ["example.test"],
      projectWrite: false
    },
    licenseExpression: "MIT",
    fallback: null
  });
  return connector;
}

function connectorWithRemoteAgentSkill(
  version: ConnectorManifest["integrations"][number]["version"],
  source = "https://github.com/example/skill"
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
    dataExposure: "remote-source",
    permissions: {
      filesystem: "none",
      network: ["github.com"],
      projectWrite: false
    },
    licenseExpression: "MIT",
    fallback: null
  });
  return connector;
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

  it.each([
    ["an empty version list", []],
    ["a blank version", [""]],
    ["a planning placeholder", ["TBD"]],
    ["a non-version token", ["latest"]]
  ])("rejects an available MCP artifact with %s", (_name, versions) => {
    const result = validateConnectorManifest(
      connectorWithMcpProtocolVersions(versions),
      {
        expectedPublisher: "soren-sdk",
        capabilityCatalog: capabilityCatalog()
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some(
          (issue) => issue.keyword === "available-mcp-protocol-version"
        )
      ).toBe(true);
    }
  });

  it("accepts an available MCP artifact with a machine-valid protocol version", () => {
    expect(
      validateConnectorManifest(
        connectorWithMcpProtocolVersions(["2025-06-18"]),
        {
          expectedPublisher: "soren-sdk",
          capabilityCatalog: capabilityCatalog()
        }
      ).ok
    ).toBe(true);
  });

  it("rejects an available remote Agent Skill without an immutable version or source pin", () => {
    const result = validateConnectorManifest(
      connectorWithRemoteAgentSkill({ status: "not-applicable" }),
      {
        expectedPublisher: "soren-sdk",
        capabilityCatalog: capabilityCatalog()
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some(
          (issue) => issue.keyword === "available-agent-skill-pin"
        )
      ).toBe(true);
    }
  });

  it("accepts an available remote Agent Skill with a resolved immutable version", () => {
    expect(
      validateConnectorManifest(
        connectorWithRemoteAgentSkill({ status: "resolved", value: "1.2.3" }),
        {
          expectedPublisher: "soren-sdk",
          capabilityCatalog: capabilityCatalog()
        }
      ).ok
    ).toBe(true);
  });

  it("accepts the valid Web Platform connector", () => {
    expect(
      validateConnectorManifest(fixture("valid", "connector.json"), {
        expectedPublisher: "soren-sdk",
        capabilityCatalog: capabilityCatalog()
      }).ok
    ).toBe(true);
  });
});
