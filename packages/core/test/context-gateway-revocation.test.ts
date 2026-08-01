import { describe, expect, it } from "vitest";

import {
  createRunGrant,
  inventoryDigest,
  ReadOnlyToolGateway,
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

function grant(toolInventory: ToolInventory) {
  return createRunGrant(
    {
      runId: "run",
      providerId: "fake",
      toolIds: ["read"],
      inventoryDigest: inventoryDigest(toolInventory),
      issuedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2026-01-02T00:00:00Z",
      allowRemoteProjectContent: false
    },
    toolInventory,
    "2026-01-01T01:00:00Z"
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function asyncProvider(
  toolInventory: ToolInventory,
  call: (signal: AbortSignal) => Promise<{ ok: boolean }>
): ReadOnlyToolProvider {
  return {
    inventory: () => toolInventory,
    call: (_toolId, _input, signal) => call(signal)
  };
}

describe("Phase 7 revocation and cancellation", () => {
  it("cancels before provider dispatch and audits the redacted cancellation", async () => {
    const toolInventory = inventory();
    let dispatched = false;
    const gateway = new ReadOnlyToolGateway(
      asyncProvider(toolInventory, async () => {
        dispatched = true;
        return { ok: true };
      }),
      () => "2026-01-01T01:00:00Z"
    );
    const runGrant = grant(toolInventory);
    gateway.registerGrant(runGrant);
    gateway.cancelRun(runGrant.runId);

    await expect(gateway.call(runGrant, "read", {}, "2026-01-01T01:00:00Z")).rejects.toThrow(
      "cancelled"
    );
    expect(dispatched).toBe(false);
    expect(gateway.auditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CALL_CANCELLED", redacted: true })
      ])
    );
  });

  it("blocks a revoked grant before provider dispatch and audits a redacted revocation", async () => {
    const toolInventory = inventory();
    let dispatched = false;
    const gateway = new ReadOnlyToolGateway(
      asyncProvider(toolInventory, async () => {
        dispatched = true;
        return { ok: true };
      }),
      () => "2026-01-01T01:00:00Z"
    );
    const runGrant = grant(toolInventory);

    gateway.registerGrant(runGrant);
    gateway.revokeGrant(runGrant, "operator-request");

    await expect(gateway.call(runGrant, "read", {}, "2026-01-01T01:00:00Z")).rejects.toThrow(
      "revoked"
    );
    expect(dispatched).toBe(false);
    expect(gateway.grantState(runGrant)).toMatchObject({ status: "revoked" });
    expect(gateway.auditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "GRANT_REVOKED", redacted: true })
      ])
    );
  });

  it("propagates revocation to an active provider AbortSignal and never accepts its result", async () => {
    const toolInventory = inventory();
    const started = deferred<void>();
    let aborted = false;
    const gateway = new ReadOnlyToolGateway(
      asyncProvider(toolInventory, (signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            resolve({ ok: true });
          });
          started.resolve();
        })
      ),
      () => "2026-01-01T01:00:00Z"
    );
    const runGrant = grant(toolInventory);
    gateway.registerGrant(runGrant);

    const call = gateway.call(runGrant, "read", {}, "2026-01-01T01:00:00Z");
    await started.promise;
    gateway.revokeGrant(runGrant, "policy-change");

    await expect(call).rejects.toThrow("cancelled");
    expect(aborted).toBe(true);
    expect(gateway.auditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "GRANT_REVOKED", redacted: true }),
        expect.objectContaining({ code: "CALL_CANCELLED", redacted: true })
      ])
    );
  });

  it("rejects a result when revocation wins after provider resolution but before acceptance", async () => {
    const toolInventory = inventory();
    const result = deferred<{ ok: boolean }>();
    const gateway = new ReadOnlyToolGateway(
      asyncProvider(toolInventory, () => result.promise),
      () => "2026-01-01T01:00:00Z"
    );
    const runGrant = grant(toolInventory);
    gateway.registerGrant(runGrant);

    const call = gateway.call(runGrant, "read", {}, "2026-01-01T01:00:00Z");
    result.resolve({ ok: true });
    gateway.revokeGrant(runGrant, "operator-request");

    await expect(call).rejects.toThrow("cancelled");
  });

  it("prevents acceptance when a grant expires while the provider is executing", async () => {
    const toolInventory = inventory();
    const result = deferred<{ ok: boolean }>();
    let now = "2026-01-01T01:00:00Z";
    const gateway = new ReadOnlyToolGateway(
      asyncProvider(toolInventory, () => result.promise),
      () => now
    );
    const runGrant = grant(toolInventory);
    gateway.registerGrant(runGrant);

    const call = gateway.call(runGrant, "read", {}, now);
    now = "2026-01-03T00:00:00Z";
    result.resolve({ ok: true });

    await expect(call).rejects.toThrow("expired");
    expect(gateway.auditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "GRANT_EXPIRED", redacted: true })
      ])
    );
  });

  it("gateway kill switch cancels active work through its AbortSignal", async () => {
    const toolInventory = inventory();
    const started = deferred<void>();
    let aborted = false;
    const gateway = new ReadOnlyToolGateway(
      asyncProvider(toolInventory, (signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            resolve({ ok: true });
          });
          started.resolve();
        })
      ),
      () => "2026-01-01T01:00:00Z"
    );
    const runGrant = grant(toolInventory);
    gateway.registerGrant(runGrant);

    const call = gateway.call(runGrant, "read", {}, "2026-01-01T01:00:00Z");
    await started.promise;
    gateway.kill();

    await expect(call).rejects.toThrow("cancelled");
    expect(aborted).toBe(true);
    expect(gateway.auditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "KILL_SWITCH", redacted: true }),
        expect.objectContaining({ code: "CALL_CANCELLED", redacted: true })
      ])
    );
  });

  it("rejects a non-cooperative provider immediately when the kill switch cancels it", async () => {
    const toolInventory = inventory();
    const started = deferred<void>();
    const gateway = new ReadOnlyToolGateway(
      asyncProvider(toolInventory, async () => {
        started.resolve();
        return new Promise<{ ok: boolean }>(() => undefined);
      }),
      () => "2026-01-01T01:00:00Z"
    );
    const runGrant = grant(toolInventory);
    gateway.registerGrant(runGrant);

    const call = gateway.call(runGrant, "read", {}, "2026-01-01T01:00:00Z");
    await started.promise;
    gateway.kill();

    await expect(call).rejects.toThrow("cancelled");
    expect(gateway.auditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CALL_CANCELLED", redacted: true })
      ])
    );
  });

  it("makes concurrent revoke and call races fail closed without successful results", async () => {
    const toolInventory = inventory();
    const providerCalls: AbortSignal[] = [];
    const gateway = new ReadOnlyToolGateway(
      asyncProvider(toolInventory, async (signal) => {
        providerCalls.push(signal);
        return { ok: true };
      }),
      () => "2026-01-01T01:00:00Z"
    );
    const runGrant = grant(toolInventory);
    gateway.registerGrant(runGrant);

    const calls = Array.from({ length: 8 }, () =>
      gateway.call(runGrant, "read", {}, "2026-01-01T01:00:00Z")
    );
    gateway.revokeGrant(runGrant, "race-test");
    const outcomes = await Promise.allSettled(calls);

    expect(outcomes.every((outcome) => outcome.status === "rejected")).toBe(true);
    expect(providerCalls.every((signal) => signal.aborted)).toBe(true);
    expect(gateway.grantState(runGrant)).toMatchObject({ status: "revoked" });
  });
});
