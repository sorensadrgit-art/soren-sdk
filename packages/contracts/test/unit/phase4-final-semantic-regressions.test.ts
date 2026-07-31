import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  validateConnectorManifest,
  type ConnectorManifest
} from "../../src/index.js";

function repositoryRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

function motionManifest(): ConnectorManifest {
  return JSON.parse(
    readFileSync(
      resolve(repositoryRoot(), "sdk-connectors/motion/sdk.manifest.json"),
      "utf8"
    )
  ) as ConnectorManifest;
}

function motionMcp(manifest: ConnectorManifest) {
  const integration = manifest.integrations.find(
    (item) => item.id === "motion-ai-kit-mcp"
  );
  if (integration === undefined || integration.kind !== "mcp-server") {
    throw new Error("Expected Motion MCP integration.");
  }
  return integration;
}

describe("Phase 4 final connector semantic regressions", () => {
  it("rejects duplicate integration IDs", () => {
    const manifest = motionManifest();
    const runtime = manifest.integrations.find(
      (integration) => integration.id === "motion-runtime"
    );
    if (runtime === undefined) throw new Error("Expected Motion runtime.");
    manifest.integrations.push(structuredClone(runtime));

    const result = validateConnectorManifest(manifest, {
      expectedPublisher: "soren-sdk"
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(
      expect.objectContaining({ keyword: "duplicate-integration-id" })
    );
  });

  it("rejects a calendar-valid but unpublished MCP protocol version", () => {
    const manifest = motionManifest();
    const integration = motionMcp(manifest);
    integration.status = "available";
    integration.protocol = {
      name: "mcp",
      supportedVersions: ["2099-01-01"],
      extensions: ["mcp-apps"]
    };

    const result = validateConnectorManifest(manifest, {
      expectedPublisher: "soren-sdk"
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(
      expect.objectContaining({ keyword: "available-mcp-protocol-version" })
    );
  });

  it.each([
    "2024-11-05",
    "2025-03-26",
    "2025-06-18",
    "2025-11-25",
    "2026-07-28"
  ])("accepts the reviewed MCP protocol revision %s", (version) => {
    const manifest = motionManifest();
    const integration = motionMcp(manifest);
    integration.status = "available";
    integration.protocol = {
      name: "mcp",
      supportedVersions: [version],
      extensions: ["mcp-apps"]
    };

    const result = validateConnectorManifest(manifest, {
      expectedPublisher: "soren-sdk"
    });

    expect(result.ok).toBe(true);
  });
});
