import { describe, expect, it } from "vitest";

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
    protocolVersions: ["1.0.0"],
    extensions: ["schemas"],
    tools: [
      {
        id: "read.metadata",
        description: "Read approved metadata.",
        readOnly: true,
        exposesProjectContent: false,
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {}
        },
        outputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["ok"],
          properties: {
            ok: { type: "boolean" }
          }
        }
      }
    ]
  };
}

function request(toolInventory: ToolInventory): RunGrantRequest {
  return {
    runId: "run-1",
    providerId: toolInventory.providerId,
    toolIds: ["read.metadata", "read.metadata"],
    inventoryDigest: inventoryDigest(toolInventory),
    protocolVersion: "1.0.0",
    extensions: ["schemas"],
    issuedAt: "2026-08-02T19:59:00.000Z",
    expiresAt: "2026-08-02T21:00:00.000Z",
    maxCalls: 1,
    maxResponseBytes: 1024,
    maxTotalResponseBytes: 1024
  };
}

function store(storeId: string, repository = new InMemoryRunGrantRepository()) {
  return new RunGrantStore({ storeId, repository });
}

describe("Phase 7 opaque run-grant foundation", () => {
  it("does not authorize a plain object copied from a valid handle", () => {
    const toolInventory = inventory();
    const grants = store("store-a");
    const issued = grants.issue(request(toolInventory), toolInventory, NOW);

    expect(grants.authorize({ id: issued.id }, NOW)).toBeUndefined();
    expect(grants.authorize(Object.freeze({ ...issued }), NOW)).toBeUndefined();
    expect(grants.authorize(issued, NOW)?.toolIds).toEqual(["read.metadata"]);
  });

  it("does not authorize unknown or fabricated handles", () => {
    const grants = store("store-a");

    expect(grants.authorize({ id: "unknown" }, NOW)).toBeUndefined();
    expect(grants.authorize(Object.freeze({ id: "fabricated" }), NOW)).toBeUndefined();
  });

  it("does not authorize a handle issued by another store", () => {
    const repository = new InMemoryRunGrantRepository();
    const first = store("store-a", repository);
    const second = store("store-b", repository);
    const toolInventory = inventory();
    const issued = first.issue(request(toolInventory), toolInventory, NOW);

    expect(first.authorize(issued, NOW)).toBeDefined();
    expect(second.authorize(issued, NOW)).toBeUndefined();
  });

  it("restores canonical state without making old handles portable", () => {
    const repository = new InMemoryRunGrantRepository();
    const original = store("store-a", repository);
    const toolInventory = inventory();
    const issued = original.issue(request(toolInventory), toolInventory, NOW);
    const restarted = store("store-a", repository);

    expect(restarted.readCanonical(issued.id)?.runId).toBe("run-1");
    expect(restarted.authorize(issued, NOW)).toBeUndefined();
  });
});
