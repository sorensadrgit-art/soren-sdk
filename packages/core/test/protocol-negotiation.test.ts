import { describe, expect, it } from "vitest";
import { negotiateProtocol, type ToolInventory } from "../src/context-gateway.js";

const inventory = (): ToolInventory => ({
  providerId: "provider-a",
  protocolVersions: ["2025-11-25", "2025-12-01"],
  extensions: ["streaming", "audit"],
  tools: [{ id: "read", description: "read", readOnly: true, exposesProjectContent: false }]
});

describe("protocol negotiation", () => {
  it("selects the highest mutual version deterministically", () => {
    const first = negotiateProtocol(inventory(), ["2025-12-01", "2025-11-25"], ["audit", "streaming"], "2026-08-01T00:00:00.000Z", "2026-08-01T01:00:00.000Z");
    const second = negotiateProtocol(inventory(), ["2025-11-25", "2025-12-01"], ["streaming", "audit"], "2026-08-01T00:00:00.000Z", "2026-08-01T01:00:00.000Z");
    expect(first.protocolVersion).toBe("2025-12-01");
    expect(first.digest).toBe(second.digest);
  });

  it("rejects incompatible protocols and unavailable extensions", () => {
    expect(() => negotiateProtocol(inventory(), ["2024-01-01"], [], "2026-08-01T00:00:00.000Z", "2026-08-01T01:00:00.000Z")).toThrow("No compatible");
    expect(() => negotiateProtocol(inventory(), ["2025-12-01"], ["missing"], "2026-08-01T00:00:00.000Z", "2026-08-01T01:00:00.000Z")).toThrow("extension");
  });
});
