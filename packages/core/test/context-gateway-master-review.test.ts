import { describe, expect, it } from "vitest";

import { inventoryDigest, type ToolInventory } from "../src/context-gateway.js";

describe("Phase 7 master review regressions", () => {
  it("binds tool schemas, description, and exposure metadata into inventory identity", () => {
    const value: ToolInventory = {
      providerId: "fake", protocolVersions: ["2026-08-01"], extensions: ["schemas"],
      tools: [{ id: "read", description: "Read approved metadata.", readOnly: true, exposesProjectContent: false, inputSchema: { type: "object" }, outputSchema: { type: "object" } }]
    };
    const original = inventoryDigest(value);
    const tool = value.tools[0];
    if (tool === undefined) throw new Error("Expected inventory tool.");
    value.tools[0] = { ...tool, exposesProjectContent: true };
    expect(inventoryDigest(value)).not.toBe(original);
  });

  it("normalizes unordered inventory protocol metadata", () => {
    const first: ToolInventory = { providerId: "fake", protocolVersions: ["2026-08-02", "2026-08-01"], extensions: ["z", "a"], tools: [] };
    const second: ToolInventory = { providerId: "fake", protocolVersions: ["2026-08-01", "2026-08-02"], extensions: ["a", "z"], tools: [] };
    expect(inventoryDigest(first)).toBe(inventoryDigest(second));
  });
});
