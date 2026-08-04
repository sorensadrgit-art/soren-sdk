import { describe, expect, it } from "vitest";

import { inventoryDigest, type ToolInventory } from "../src/context-gateway.js";
import {
  InMemoryRunGrantRepository,
  RunGrantStore,
  type RunGrantRequest
} from "../src/run-grants.js";

const NOW = "2026-08-04T00:00:00.000Z";

function inventory(): ToolInventory {
  return {
    providerId: "provider-a",
    protocolVersions: ["2026-08-01"],
    extensions: ["schemas"],
    tools: [{ id: "read", description: "Read metadata.", readOnly: true, exposesProjectContent: false }]
  };
}

function request(value: ToolInventory): RunGrantRequest {
  return {
    runId: "run-a",
    providerId: value.providerId,
    toolIds: ["read"],
    inventoryDigest: inventoryDigest(value),
    protocolVersion: "2026-08-01",
    extensions: ["schemas"],
    issuedAt: "2026-08-03T00:00:00.000Z",
    expiresAt: "2026-08-05T00:00:00.000Z",
    maxCalls: 1,
    maxResponseBytes: 32,
    maxTotalResponseBytes: 32
  };
}

describe("canonical opaque run grants", () => {
  it("authorizes a copied durable handle only with its token and rejects forged tokens", () => {
    const value = inventory();
    const repository = new InMemoryRunGrantRepository();
    const original = new RunGrantStore({ issuerId: "issuer-a", repository });
    const issued = original.issue(request(value), value, NOW);
    const restarted = new RunGrantStore({ issuerId: "issuer-a", repository });

    expect(restarted.authorize({ ...issued }, NOW)?.id).toBe(issued.id);
    expect(restarted.authorize({ id: issued.id, token: "forged" }, NOW)).toBeUndefined();
    expect(restarted.authorize({ id: "forged", token: issued.token }, NOW)).toBeUndefined();
  });

  it("atomically reserves, releases, commits, and exhausts the canonical quota", () => {
    const value = inventory();
    const store = new RunGrantStore({ issuerId: "issuer-a", repository: new InMemoryRunGrantRepository() });
    const issued = store.issue(request(value), value, NOW);
    const first = store.reserveCall(issued, NOW);

    expect(() => store.reserveCall(issued, NOW)).toThrow("quota");
    expect(store.releaseCall(issued, first, NOW).callsUsed).toBe(0);
    const second = store.reserveCall(issued, NOW);
    expect(store.commitCall(issued, second, 32, NOW).state).toBe("exhausted");
    expect(store.authorize(issued, NOW)).toBeUndefined();
  });

  function expectReleasedAfterTransition(
    transition: (store: RunGrantStore, grant: ReturnType<RunGrantStore["issue"]>) => void,
    expectedState: "active" | "revoked" | "expired" | "consumed"
  ): void {
    const value = inventory();
    const store = new RunGrantStore({ issuerId: "issuer-a", repository: new InMemoryRunGrantRepository() });
    const issued = store.issue({ ...request(value), maxCalls: 2, maxTotalResponseBytes: 64 }, value, NOW);
    const reservation = store.reserveCall(issued, NOW);
    transition(store, issued);
    const released = store.releaseCall(issued, reservation, "2026-08-06T00:00:00.000Z");
    expect(released.state).toBe(expectedState);
    expect(released.reservedCalls).toBe(0);
    expect(released.reservedResponseBytes).toBe(0);
    expect(released.callsUsed).toBe(0);
    expect(released.responseBytesUsed).toBe(0);
    expect(() => store.releaseCall(issued, reservation, "2026-08-06T00:00:00.000Z")).toThrow("reservation");
  }

  it("releases a reservation after grant revocation", () => {
    expectReleasedAfterTransition((store, grant) => { store.revoke(grant, NOW); }, "revoked");
  });

  it("releases a reservation after grant expiration", () => {
    expectReleasedAfterTransition((store, grant) => { store.expire(grant, "2026-08-06T00:00:00.000Z"); }, "expired");
  });

  it("releases a reservation after grant consumption", () => {
    expectReleasedAfterTransition((store, grant) => { store.consume(grant, NOW); }, "consumed");
  });

  it("releases a reservation after another reservation advances revision", () => {
    const value = inventory();
    const store = new RunGrantStore({ issuerId: "issuer-a", repository: new InMemoryRunGrantRepository() });
    const issued = store.issue({ ...request(value), maxCalls: 2, maxTotalResponseBytes: 64 }, value, NOW);
    const first = store.reserveCall(issued, NOW);
    store.reserveCall(issued, NOW);
    const released = store.releaseCall(issued, first, NOW);
    expect(released.state).toBe("active");
    expect(released.reservedCalls).toBe(1);
    expect(released.reservedResponseBytes).toBe(32);
    expect(released.callsUsed).toBe(0);
    expect(() => store.releaseCall(issued, first, NOW)).toThrow("reservation");
  });

  it("persists only a token hash and enforces lifecycle transitions", () => {
    const value = inventory();
    const repository = new InMemoryRunGrantRepository();
    const store = new RunGrantStore({ issuerId: "issuer-a", repository });
    const issued = store.issue(request(value), value, NOW);
    const record = store.readCanonical(issued.id);

    expect(record?.tokenHash).not.toBe(issued.token);
    expect(record?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(store.revoke(issued, NOW).state).toBe("revoked");
    expect(store.authorize(issued, NOW)).toBeUndefined();
  });
});
