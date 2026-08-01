import { describe, expect, it } from "vitest";

import {
  InMemoryRunGrantPersistence,
  inventoryDigest,
  ReadOnlyToolGateway,
  RunGrantStore,
  type ReadOnlyToolProvider,
  type ToolInventory
} from "../src/context-gateway.js";

function inventory(): ToolInventory {
  return {
    providerId: "fake",
    protocolVersions: ["2025-11-25"],
    tools: [
      {
        id: "read",
        description: "Read approved metadata.",
        readOnly: true,
        exposesProjectContent: false
      }
    ]
  };
}

function setup(options: { persistence?: InMemoryRunGrantPersistence; storeId?: string } = {}) {
  const toolInventory = inventory();
  const provider: ReadOnlyToolProvider = {
    inventory: () => toolInventory,
    call: () => ({ ok: true })
  };
  const store = new RunGrantStore(
    options.persistence === undefined
      ? { storeId: options.storeId ?? "primary" }
      : { persistence: options.persistence, storeId: options.storeId ?? "primary" }
  );
  const gateway = new ReadOnlyToolGateway(
    provider,
    () => "2026-01-01T01:00:00Z",
    store
  );
  const issue = (
    overrides: Record<string, unknown> = {},
    now = "2026-01-01T01:00:00Z"
  ) =>
    store.issue(
      {
        runId: "run",
        providerId: "fake",
        toolIds: ["read"],
        inventoryDigest: inventoryDigest(toolInventory),
        issuedAt: "2026-01-01T00:00:00Z",
        expiresAt: "2026-01-02T00:00:00Z",
        allowRemoteProjectContent: false,
        ...overrides
      },
      toolInventory,
      now
    );
  return { gateway, issue, store, toolInventory };
}

describe("Phase 7 canonical grant store", () => {
  it("issues frozen opaque grant handles without caller-controlled permission fields", () => {
    const { issue } = setup();
    const grant = issue();

    expect(Object.keys(grant)).toEqual(["id"]);
    expect(Object.isFrozen(grant)).toBe(true);
  });

  it("rejects forged grant records", () => {
    const { gateway } = setup();
    const forged = { id: "forged", toolIds: ["read"], expiresAt: "2999-01-01T00:00:00Z" };

    expect(() => gateway.call(forged, "read", {}, "2026-01-01T01:00:00Z")).toThrow("Grant denied");
  });

  it("rejects a copied opaque grant handle", () => {
    const { gateway, issue } = setup();
    const copied = { ...issue() };

    expect(() => gateway.call(copied, "read", {}, "2026-01-01T01:00:00Z")).toThrow("Grant denied");
  });

  it("rejects altered tool IDs instead of trusting grant fields", () => {
    const { gateway, issue } = setup();
    const altered = { ...issue(), toolIds: ["admin"] };

    expect(() => gateway.call(altered, "admin", {}, "2026-01-01T01:00:00Z")).toThrow("Grant denied");
  });

  it("rejects altered expiration instead of trusting grant fields", () => {
    const { gateway, issue } = setup();
    const altered = { ...issue(), expiresAt: "2999-01-01T00:00:00Z" };

    expect(() => gateway.call(altered, "read", {}, "2026-01-01T01:00:00Z")).toThrow("Grant denied");
  });

  it("rejects unknown opaque IDs", () => {
    const { gateway } = setup();

    expect(() => gateway.call({ id: "unknown" }, "read", {}, "2026-01-01T01:00:00Z")).toThrow("Grant denied");
  });

  it("rejects cross-store grant reuse", () => {
    const first = setup({ storeId: "first" });
    const second = setup({ storeId: "second" });

    expect(() => second.gateway.call(first.issue(), "read", {}, "2026-01-01T01:00:00Z")).toThrow("Grant denied");
  });

  it("rejects revoked grants", () => {
    const { gateway, issue, store } = setup();
    const grant = issue();
    store.revoke(grant);

    expect(() => gateway.call(grant, "read", {}, "2026-01-01T01:00:00Z")).toThrow("Grant denied");
  });

  it("rejects expired grants", () => {
    const { gateway, issue } = setup();
    const grant = issue(
      { expiresAt: "2026-01-01T00:30:00Z" },
      "2026-01-01T00:15:00Z"
    );

    expect(() => gateway.call(grant, "read", {}, "2026-01-01T01:00:00Z")).toThrow("Grant denied");
  });

  it("rejects replayed grants after the canonical store consumes them", () => {
    const { gateway, issue } = setup();
    const grant = issue();

    expect(gateway.call(grant, "read", {}, "2026-01-01T01:00:00Z")).toEqual({ ok: true });
    expect(() => gateway.call(grant, "read", {}, "2026-01-01T01:00:01Z")).toThrow("Grant denied");
  });

  it("persists canonical grant state through a store restart", () => {
    const persistence = new InMemoryRunGrantPersistence();
    const first = setup({ persistence, storeId: "restartable" });
    const grant = first.issue();
    first.store.revoke(grant);

    const restarted = setup({ persistence, storeId: "restartable" });
    expect(() => restarted.gateway.call(grant, "read", {}, "2026-01-01T01:00:00Z")).toThrow("Grant denied");
  });

  it("restores active canonical grants after a store restart", () => {
    const persistence = new InMemoryRunGrantPersistence();
    const first = setup({ persistence, storeId: "restartable-active" });
    const grant = first.issue({ maxCalls: 2 });

    const restarted = setup({ persistence, storeId: "restartable-active" });
    expect(restarted.gateway.call(grant, "read", {}, "2026-01-01T01:00:00Z")).toEqual({ ok: true });
  });

  it("exhausts grants with an explicit multi-call limit", () => {
    const { gateway, issue } = setup();
    const grant = issue({ maxCalls: 2 });

    expect(gateway.call(grant, "read", {}, "2026-01-01T01:00:00Z")).toEqual({ ok: true });
    expect(gateway.call(grant, "read", {}, "2026-01-01T01:00:01Z")).toEqual({ ok: true });
    expect(() => gateway.call(grant, "read", {}, "2026-01-01T01:00:02Z")).toThrow("Grant denied");
  });

  it("detects tool-inventory drift using the canonical inventory digest", () => {
    const { gateway, issue, toolInventory } = setup();
    const grant = issue();
    const tool = toolInventory.tools[0];
    if (tool === undefined) throw new Error("Expected tool inventory.");
    toolInventory.tools[0] = { ...tool, description: "Changed after grant issue." };

    expect(() => gateway.call(grant, "read", {}, "2026-01-01T01:00:00Z")).toThrow("inventory");
  });

  it("retains the gateway kill switch", () => {
    const { gateway, issue } = setup();
    gateway.kill();

    expect(() => gateway.call(issue(), "read", {}, "2026-01-01T01:00:00Z")).toThrow("disabled");
  });

  it("retains read-only enforcement when issuing grants", () => {
    const { toolInventory, store } = setup();
    toolInventory.tools.push({
      id: "write",
      description: "Mutates a project.",
      readOnly: false,
      exposesProjectContent: false
    });

    expect(() => store.issue({
      runId: "run",
      providerId: "fake",
      toolIds: ["write"],
      inventoryDigest: inventoryDigest(toolInventory),
      issuedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2026-01-02T00:00:00Z",
      allowRemoteProjectContent: false
    }, toolInventory, "2026-01-01T01:00:00Z")).toThrow("read-only");
  });

  it("retains provider binding when issuing grants", () => {
    const { store, toolInventory } = setup();

    expect(() => store.issue({
      runId: "run",
      providerId: "another-provider",
      toolIds: ["read"],
      inventoryDigest: inventoryDigest(toolInventory),
      issuedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2026-01-02T00:00:00Z",
      allowRemoteProjectContent: false
    }, toolInventory, "2026-01-01T01:00:00Z")).toThrow("Invalid run grant");
  });

  it("retains the UTF-8 response-size limit", () => {
    const toolInventory = inventory();
    const provider: ReadOnlyToolProvider = {
      inventory: () => toolInventory,
      call: () => ({ value: "😀".repeat(20_000) })
    };
    const store = new RunGrantStore({ storeId: "response-limit" });
    const gateway = new ReadOnlyToolGateway(provider, () => "2026-01-01T01:00:00Z", store);
    const grant = store.issue({
      runId: "run",
      providerId: "fake",
      toolIds: ["read"],
      inventoryDigest: inventoryDigest(toolInventory),
      issuedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2026-01-02T00:00:00Z",
      allowRemoteProjectContent: false
    }, toolInventory, "2026-01-01T01:00:00Z");

    expect(() => gateway.call(grant, "read", {}, "2026-01-01T01:00:00Z")).toThrow("response exceeds limit");
  });
});
