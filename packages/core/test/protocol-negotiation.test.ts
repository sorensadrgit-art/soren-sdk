import { describe, expect, it } from "vitest";
import { createRunGrant, inventoryDigest, negotiateProtocol, ReadOnlyToolGateway, type ToolInventory } from "../src/context-gateway.js";

const now = "2026-08-01T00:00:00.000Z";
const expires = "2026-08-01T01:00:00.000Z";
const inventory = (): ToolInventory => ({
  providerId: "provider-a", protocolVersions: ["2025-11-25", "2025-12-01"], extensions: ["audit", "streaming"],
  tools: [{ id: "read", description: "read", readOnly: true, exposesProjectContent: false, inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } }, additionalProperties: false }, outputSchema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } }, additionalProperties: false } }]
});
const grant = (value: ToolInventory) => createRunGrant({ runId: "run", providerId: value.providerId, toolIds: ["read"], inventoryDigest: inventoryDigest(value), issuedAt: now, expiresAt: expires, allowRemoteProjectContent: false, protocolVersion: "2025-12-01", extensions: ["audit"] }, value, now);

describe("phase 7 negotiation and schemas", () => {
  it("selects highest mutual protocol with order-independent digest", () => {
    const a = negotiateProtocol(inventory(), ["2025-12-01", "2025-11-25"], ["audit", "streaming"], now, expires);
    const b = negotiateProtocol(inventory(), ["2025-11-25", "2025-12-01"], ["streaming", "audit"], now, expires);
    expect(a.protocolVersion).toBe("2025-12-01"); expect(a.digest).toBe(b.digest);
  });
  it("rejects no compatible version and missing extension", () => {
    expect(() => negotiateProtocol(inventory(), ["2024-01-01"], [], now, expires)).toThrow("No compatible");
    expect(() => negotiateProtocol(inventory(), ["2025-12-01"], ["missing"], now, expires)).toThrow("extension");
  });
  it("rejects negotiation and schema drift before dispatch", () => {
    const value = inventory(); const provider = { inventory: () => value, call: () => ({ ok: true }) };
    const gateway = new ReadOnlyToolGateway(provider, () => now); const issued = grant(value);
    value.protocolVersions = ["2025-11-25"];
    expect(() => gateway.call(issued, "read", { path: "x" }, now)).toThrow();
    expect(gateway.auditEvents().at(-1)?.code).toBe("INVENTORY_CHANGED");
  });
  it("rejects malformed input and output and emits redacted audit codes", () => {
    const value = inventory(); const provider = { inventory: () => value, call: () => ({ bad: true }) };
    const gateway = new ReadOnlyToolGateway(provider, () => now); const issued = grant(value);
    expect(() => gateway.call(issued, "read", {} as never, now)).toThrow("Missing required");
    expect(gateway.auditEvents().at(-1)?.code).toBe("INPUT_SCHEMA_FAILED");
    expect(() => gateway.call(issued, "read", { path: "x" }, now)).toThrow("Missing required");
    expect(gateway.auditEvents().at(-1)?.code).toBe("OUTPUT_SCHEMA_FAILED");
  });
  it("accepts valid canonical input and output", () => {
    const value = inventory(); const gateway = new ReadOnlyToolGateway({ inventory: () => value, call: () => ({ ok: true }) }, () => now);
    expect(gateway.call(grant(value), "read", { path: "x" }, now)).toEqual({ ok: true });
  });
});
