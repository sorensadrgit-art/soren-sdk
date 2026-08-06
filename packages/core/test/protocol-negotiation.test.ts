import { describe, expect, it } from "vitest";

import { negotiateProtocol, type ToolInventory } from "../src/context-gateway.js";

const now = "2026-08-01T00:00:00.000Z";
const expires = "2026-08-01T01:00:00.000Z";

function inventory(): ToolInventory {
  return { providerId: "provider-a", protocolVersions: ["2025-11-25", "2025-12-01"], extensions: ["audit", "streaming"], tools: [] };
}

describe("phase 7 protocol negotiation", () => {
  it("selects the highest mutual protocol independently of provider caller and extension ordering", () => {
    const first = negotiateProtocol(inventory(), ["2025-12-01", "2025-11-25"], ["audit", "streaming"], now, expires);
    const second = negotiateProtocol({ ...inventory(), protocolVersions: ["2025-12-01", "2025-11-25"], extensions: ["streaming", "audit"] }, ["2025-11-25", "2025-12-01"], ["streaming", "audit"], now, expires);
    expect(first.protocolVersion).toBe("2025-12-01"); expect(second.protocolVersion).toBe("2025-12-01"); expect(first.extensions).toEqual(["audit", "streaming"]); expect(second.extensions).toEqual(["audit", "streaming"]); expect(first.inventoryDigest).toBe(second.inventoryDigest); expect(first.digest).toBe(second.digest);
  });
  it("normalizes duplicate caller versions provider versions and required extensions", () => {
    const duplicated = negotiateProtocol({ ...inventory(), protocolVersions: ["2025-12-01", "2025-11-25", "2025-12-01"], extensions: ["streaming", "audit", "streaming"] }, ["2025-12-01", "2025-11-25", "2025-12-01"], ["streaming", "audit", "streaming"], now, expires);
    const canonical = negotiateProtocol(inventory(), ["2025-11-25", "2025-12-01"], ["audit", "streaming"], now, expires);
    expect(duplicated.protocolVersion).toBe(canonical.protocolVersion); expect(duplicated.extensions).toEqual(["audit", "streaming"]); expect(duplicated.inventoryDigest).toBe(canonical.inventoryDigest); expect(duplicated.digest).toBe(canonical.digest);
  });
  it("rejects when no protocol version is compatible", () => expect(() => negotiateProtocol(inventory(), ["2024-01-01"], [], now, expires)).toThrow("No compatible protocol version"));
  it("rejects a malformed caller protocol version", () => expect(() => negotiateProtocol(inventory(), ["not-a-version"], [], now, expires)).toThrow("protocol version"));
  it("rejects malformed provider protocol metadata", () => expect(() => negotiateProtocol({ ...inventory(), protocolVersions: ["not-a-version"] }, ["not-a-version"], [], now, expires)).toThrow("protocol version"));
  it("rejects a required extension that the provider does not support", () => expect(() => negotiateProtocol(inventory(), ["2025-12-01"], ["missing-extension"], now, expires)).toThrow("extension"));
  it("rejects expiration equal to issuance", () => expect(() => negotiateProtocol(inventory(), ["2025-12-01"], [], now, now)).toThrow("expires before issuance"));
  it("rejects expiration before issuance", () => expect(() => negotiateProtocol(inventory(), ["2025-12-01"], [], now, "2026-07-31T23:59:59.000Z")).toThrow("expires before issuance"));
  it("rejects a malformed issuance timestamp", () => expect(() => negotiateProtocol(inventory(), ["2025-12-01"], [], "not-a-timestamp", expires)).toThrow("issuedAt"));
  it("rejects a malformed expiration timestamp", () => expect(() => negotiateProtocol(inventory(), ["2025-12-01"], [], now, "not-a-timestamp")).toThrow("expiresAt"));
});
