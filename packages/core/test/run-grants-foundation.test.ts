import { describe, expect, it } from "vitest";

import type { Digest } from "@soren-sdk/contracts";

import { inventoryDigest, type ToolInventory } from "../src/context-gateway.js";
import {
  InMemoryRunGrantRepository,
  RunGrantStore,
  type RunGrantRequest
} from "../src/run-grants.js";

const NOW = "2026-08-02T20:00:00.000Z";

function inventory(): ToolInventory {
  return {
    providerId: "provider-a",
    protocolVersions: ["2026-08-01"],
    extensions: ["schemas"],
    tools: [{
      id: "read.metadata",
      description: "Read approved metadata.",
      readOnly: true,
      exposesProjectContent: false,
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      outputSchema: {
        type: "object", additionalProperties: false, required: ["ok"],
        properties: { ok: { type: "boolean" } }
      }
    }]
  };
}

function request(toolInventory: ToolInventory): RunGrantRequest {
  return {
    runId: "run-1", providerId: toolInventory.providerId,
    toolIds: ["read.metadata", "read.metadata"],
    inventoryDigest: inventoryDigest(toolInventory), protocolVersion: "2026-08-01",
    extensions: ["schemas"], issuedAt: "2026-08-02T19:59:00.000Z",
    expiresAt: "2026-08-02T21:00:00.000Z", maxCalls: 1,
    maxResponseBytes: 1024, maxTotalResponseBytes: 1024
  };
}

function cloneInventory(value: ToolInventory): ToolInventory { return { ...value, protocolVersions: [...value.protocolVersions], ...(value.extensions === undefined ? {} : { extensions: [...value.extensions] }), tools: value.tools.map((tool) => ({ ...tool })) }; }
function requestWith(value: ToolInventory, overrides: Partial<RunGrantRequest>): RunGrantRequest { return { ...request(value), ...overrides }; }

function store(issuerId: string, repository = new InMemoryRunGrantRepository()): RunGrantStore {
  return new RunGrantStore({ issuerId, repository });
}

describe("Phase 7 opaque run-grant foundation", () => {
  it("rejects a copied handle without its token", () => {
    const toolInventory = inventory();
    const grants = store("issuer-a");
    const issued = grants.issue(request(toolInventory), toolInventory, NOW);

    expect(grants.authorize({ id: issued.id }, NOW)).toBeUndefined();
    expect(grants.authorize(Object.freeze({ id: issued.id, token: "wrong" }), NOW)).toBeUndefined();
    expect(grants.authorize(issued, NOW)?.toolIds).toEqual(["read.metadata"]);
  });

  it("rejects unknown and fabricated handles", () => {
    const grants = store("issuer-a");

    expect(grants.authorize({ id: "unknown", token: "unknown" }, NOW)).toBeUndefined();
    expect(grants.authorize(Object.freeze({ id: "fabricated", token: "fabricated" }), NOW)).toBeUndefined();
  });

  it("does not authorize a handle issued by another issuer", () => {
    const repository = new InMemoryRunGrantRepository();
    const first = store("issuer-a", repository);
    const second = store("issuer-b", repository);
    const toolInventory = inventory();
    const issued = first.issue(request(toolInventory), toolInventory, NOW);

    expect(first.authorize(issued, NOW)).toBeDefined();
    expect(second.authorize(issued, NOW)).toBeUndefined();
  });

  it("restores canonical state and authorizes a copied durable handle", () => {
    const repository = new InMemoryRunGrantRepository();
    const original = store("issuer-a", repository);
    const toolInventory = inventory();
    const issued = original.issue(request(toolInventory), toolInventory, NOW);
    const restarted = store("issuer-a", repository);

    expect(restarted.readCanonical(issued.id)?.runId).toBe("run-1");
    expect(restarted.authorize(Object.freeze({ ...issued }), NOW)?.id).toBe(issued.id);
  });
  it("rejects duplicate provider tool definitions during issuance", () => {
    const value = inventory(); const tool = value.tools[0]; if (tool === undefined) throw new Error("Expected inventory tool."); value.tools = [tool, { ...tool, description: "Conflicting duplicate definition." }]; const grants = store("issuer-a"); expect(() => grants.issue(request(value), value, NOW)).toThrow("duplicate tool IDs");
  });
  it("rejects malformed provider protocol metadata during issuance", () => {
    const value = inventory(); value.protocolVersions = ["not-a-version"]; const grants = store("issuer-a"); const invalid = { ...request(value), protocolVersion: "not-a-version" }; expect(() => grants.issue(invalid, value, NOW)).toThrow("protocol");
  });
  it("rejects an empty provider identity during issuance", () => {
    const value = inventory(); value.providerId = ""; const grants = store("issuer-a"); expect(() => grants.issue(request(value), value, NOW)).toThrow("providerId");
  });
  it("normalizes duplicate authorized tool IDs without retaining the caller array", () => { const value = inventory(); const grants = store("issuer-a"); const toolIds = ["read.metadata", "read.metadata"]; const issued = grants.issue(requestWith(value, { toolIds }), value, NOW); toolIds.push("unknown"); expect(grants.readCanonical(issued.id)?.toolIds).toEqual(["read.metadata"]); expect(grants.authorize(issued, NOW)?.toolIds).toEqual(["read.metadata"]); });
  it("rejects a non-read-only authorized tool during issuance", () => { const value = cloneInventory(inventory()); const tool = value.tools[0]; if (tool === undefined) throw new Error("Expected inventory tool."); value.tools[0] = { ...tool, readOnly: false }; const grants = store("issuer-a"); expect(() => grants.issue(request(value), value, NOW)).toThrow("read-only tool policy"); });
  it.each([
    ["provider mismatch", { providerId: "different-provider" }, "inventory"], ["inventory digest mismatch", { inventoryDigest: `sha256:${"0".repeat(64)}` as Digest }, "inventory"], ["unsupported protocol", { protocolVersion: "2026-07-01" }, "protocol"], ["unsupported extension", { extensions: ["missing-extension"] }, "extension"], ["unknown tool", { toolIds: ["unknown"] }, "read-only tool policy"], ["empty tool list", { toolIds: [] }, "at least one tool"], ["future issuance", { issuedAt: "2026-08-02T20:01:00.000Z" }, "valid time window"], ["already expired", { expiresAt: NOW }, "valid time window"], ["zero maxCalls", { maxCalls: 0 }, "positive safe integer"], ["zero maxResponseBytes", { maxResponseBytes: 0 }, "positive safe integer"], ["zero maxTotalResponseBytes", { maxTotalResponseBytes: 0 }, "positive safe integer"], ["unsafe maxCalls", { maxCalls: Number.MAX_SAFE_INTEGER + 1 }, "positive safe integer"], ["per-call bytes exceed total", { maxResponseBytes: 2048, maxTotalResponseBytes: 1024 }, "cannot exceed"]
  ] as const)("rejects %s during issuance", (_name, overrides, message) => { const value = inventory(); const grants = store("issuer-a"); expect(() => grants.issue(requestWith(value, overrides), value, NOW)).toThrow(message); });
});
