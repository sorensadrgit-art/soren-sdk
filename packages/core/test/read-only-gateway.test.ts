import { describe, expect, it, vi } from "vitest";

import { canonicalJson, type Digest, type JsonValue } from "@soren-sdk/contracts";
import { inventoryDigest, type ToolInventory } from "../src/context-gateway.js";
import { InMemoryRunGrantRepository, RunGrantStore, type RunGrantRequest } from "../src/run-grants.js";
import { InMemoryConsentStore, projectContentConsentDigest, ReadOnlyToolGateway, type ProjectContentConsent } from "../src/read-only-gateway.js";

const NOW = "2026-08-04T00:00:00.000Z";
const LATER = "2026-08-04T01:00:00.000Z";

function inventory(): ToolInventory {
  return { providerId: "provider", protocolVersions: ["2026-08-01"], tools: [{ id: "read", description: "Read project", readOnly: true, exposesProjectContent: true, inputSchema: { type: "object", required: ["path"], additionalProperties: false, properties: { path: { type: "string" } } }, outputSchema: { type: "object", required: ["ok"], additionalProperties: false, properties: { ok: { type: "boolean" } } } }] };
}
function request(value: ToolInventory): RunGrantRequest {
  return { runId: "run", providerId: value.providerId, toolIds: ["read"], inventoryDigest: inventoryDigest(value), protocolVersion: "2026-08-01", extensions: [], issuedAt: NOW, expiresAt: LATER, maxCalls: 2, maxResponseBytes: 64, maxTotalResponseBytes: 128 };
}
function consent(overrides: Partial<Omit<ProjectContentConsent, "digest">> = {}, tamper = false): ProjectContentConsent {
  const value = { runId: "run", providerId: "provider", toolId: "read", projectSnapshot: "project", policySnapshot: "policy", scopes: ["read"], issuedAt: NOW, expiresAt: LATER, ...overrides };
  let digest: Digest;
  try { digest = projectContentConsentDigest(value); } catch { digest = `sha256:${"0".repeat(64)}` as Digest; }
  return { ...value, digest: tamper ? `sha256:${"0".repeat(64)}` as Digest : digest };
}
interface Deferred<T> { readonly promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void; }
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });

  return { promise, resolve, reject };
}

function fixture(records: readonly ProjectContentConsent[] = [], call?: (signal: AbortSignal) => Promise<{ ok: boolean }>, clock: () => string = () => NOW) {
  const value = inventory(); const grants = new RunGrantStore({ issuerId: "issuer", repository: new InMemoryRunGrantRepository() });
 const grant = grants.issue(request(value), value, NOW);
  let calls = 0;
  const gateway = new ReadOnlyToolGateway({ inventory: () => value, call: async (_id, _input, options) => { calls += 1; return call === undefined ? { ok: true } : call(options.signal); } }, grants, new InMemoryConsentStore(records), clock);
  return { gateway, grant, grants, calls: () => calls };
}

interface QuotaFixtureOptions { readonly maxCalls: number; readonly maxResponseBytes: number; readonly maxTotalResponseBytes: number; call(attempt: number, signal: AbortSignal): JsonValue | Promise<JsonValue>; }
function canonicalBytes(value: JsonValue): number { return new TextEncoder().encode(canonicalJson(value)).byteLength; }
function quotaFixture(options: QuotaFixtureOptions) { const value = inventory(); const tool = value.tools[0]; if (tool === undefined) throw new Error("Expected inventory tool."); value.tools[0] = { ...tool, outputSchema: { type: "object", required: ["value"], additionalProperties: false, properties: { value: { type: "string" } } } }; const grants = new RunGrantStore({ issuerId: "issuer", repository: new InMemoryRunGrantRepository() }); const grant = grants.issue({ ...request(value), maxCalls: options.maxCalls, maxResponseBytes: options.maxResponseBytes, maxTotalResponseBytes: options.maxTotalResponseBytes }, value, NOW); let calls = 0; const gateway = new ReadOnlyToolGateway({ inventory: () => value, call: (_id, _input, providerOptions) => { calls += 1; return options.call(calls, providerOptions.signal); } }, grants, new InMemoryConsentStore([consent()]), () => NOW); return { gateway, grants, grant, calls: () => calls }; }

function inventoryDriftFixture() {
  const issuedInventory = inventory();
  let currentInventory: ToolInventory = { ...issuedInventory, protocolVersions: [...issuedInventory.protocolVersions], tools: issuedInventory.tools.map((tool) => ({ ...tool })) };
  const grants = new RunGrantStore({ issuerId: "issuer", repository: new InMemoryRunGrantRepository() });

  const grant = grants.issue(request(issuedInventory), issuedInventory, NOW);
  let calls = 0;
  const gateway = new ReadOnlyToolGateway({ inventory: () => currentInventory, call: async () => { calls += 1; return { ok: true }; } }, grants, new InMemoryConsentStore([consent()]), () => NOW);
  return { gateway, grants, grant, replaceInventory(next: ToolInventory): void { currentInventory = next; }, providerCalls(): number { return calls; } };
}

function expectInventoryDriftDenied(value: ReturnType<typeof inventoryDriftFixture>): void {
  const events = value.gateway.auditEvents(); expect(value.providerCalls()).toBe(0); expect(events.filter((event) => event.code === "INVENTORY_CHANGED")).toHaveLength(1); expect(events.filter((event) => event.code === "GRANT_DENIED")).toHaveLength(0); expect(events.filter((event) => event.code === "TOOL_DENIED")).toHaveLength(0); expect(events.filter((event) => event.code === "CONSENT_DENIED")).toHaveLength(0); expect(events.filter((event) => event.code === "INPUT_SCHEMA_FAILED")).toHaveLength(0); expect(events.filter((event) => event.code === "OUTPUT_SCHEMA_FAILED")).toHaveLength(0); expect(events.filter((event) => event.code === "PROVIDER_FAILED")).toHaveLength(0); expect(events.filter((event) => event.code === "TOOL_CALLED")).toHaveLength(0); const record = value.grants.readCanonical(value.grant.id); expect(record?.reservedCalls).toBe(0); expect(record?.reservedResponseBytes).toBe(0); expect(record?.callsUsed).toBe(0); expect(record?.responseBytesUsed).toBe(0);
}

function expectInvalidInventoryDenied(value: ReturnType<typeof inventoryDriftFixture>): void {
  const events = value.gateway.auditEvents(); expect(value.providerCalls()).toBe(0); expect(events.filter((event) => event.code === "INVENTORY_INVALID")).toHaveLength(1); for (const code of ["INVENTORY_CHANGED", "GRANT_DENIED", "TOOL_DENIED", "CONSENT_DENIED", "INPUT_SCHEMA_FAILED", "OUTPUT_SCHEMA_FAILED", "PROVIDER_FAILED", "TOOL_CALLED"]) expect(events.filter((event) => event.code === code)).toHaveLength(0); const record = value.grants.readCanonical(value.grant.id); expect(record?.reservedCalls).toBe(0); expect(record?.reservedResponseBytes).toBe(0); expect(record?.callsUsed).toBe(0); expect(record?.responseBytesUsed).toBe(0);
}

function expectInputDenied(value: ReturnType<typeof fixture>): void { const events = value.gateway.auditEvents(); const record = value.grants.readCanonical(value.grant.id); expect(value.calls()).toBe(0); expect(events.filter((event) => event.code === "INPUT_SCHEMA_FAILED")).toHaveLength(1); for (const code of ["OUTPUT_SCHEMA_FAILED", "PROVIDER_FAILED", "TOOL_CALLED"]) expect(events.filter((event) => event.code === code)).toHaveLength(0); expect(record?.reservedCalls).toBe(0); expect(record?.reservedResponseBytes).toBe(0); expect(record?.callsUsed).toBe(0); expect(record?.responseBytesUsed).toBe(0); }
function expectOutputDenied(value: ReturnType<typeof fixture>): void { const events = value.gateway.auditEvents(); const record = value.grants.readCanonical(value.grant.id); expect(value.calls()).toBe(1); expect(events.filter((event) => event.code === "OUTPUT_SCHEMA_FAILED")).toHaveLength(1); expect(events.filter((event) => event.code === "PROVIDER_FAILED")).toHaveLength(0); expect(events.filter((event) => event.code === "TOOL_CALLED")).toHaveLength(0); expect(record?.reservedCalls).toBe(0); expect(record?.reservedResponseBytes).toBe(0); expect(record?.callsUsed).toBe(0); expect(record?.responseBytesUsed).toBe(0); }

async function denied(records: readonly ProjectContentConsent[]): Promise<void> {
  const value = fixture(records);
  await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).rejects.toThrow("denied");
  expect(value.calls()).toBe(0); expect(value.gateway.auditEvents().at(-1)?.code).toBe("CONSENT_DENIED");
}

describe("project-content consent", () => {
  it("denies no consent", () => denied([]));
  it("denies wrong provider consent", () => denied([consent({ providerId: "other" })]));
  it("denies wrong tool consent", () => denied([consent({ toolId: "other" })]));
  it("denies wrong project snapshot consent", () => denied([consent({ projectSnapshot: "other" })]));
  it("denies wrong policy snapshot consent", () => denied([consent({ policySnapshot: "other" })]));
  it("denies missing required scope", () => denied([consent({ scopes: ["metadata"] })]));
  it("denies expired consent", () => denied([consent({ expiresAt: NOW })]));
  it("denies not-yet-valid consent", () => denied([consent({ issuedAt: LATER, expiresAt: "2026-08-04T02:00:00.000Z" })]));
  it("denies malformed issuedAt consent", () => denied([consent({ issuedAt: "invalid" })]));
  it("denies malformed expiresAt consent", () => denied([consent({ expiresAt: "invalid" })]));
  it("denies equal issuance and expiration", () => denied([consent({ expiresAt: NOW })]));
  it("denies expiration before issuance", () => denied([consent({ issuedAt: LATER, expiresAt: NOW })]));
  it("denies empty run ID", () => denied([consent({ runId: "" })]));
  it("denies empty provider ID", () => denied([consent({ providerId: "" })]));
  it("denies empty tool ID", () => denied([consent({ toolId: "" })]));
  it("denies empty project snapshot", () => denied([consent({ projectSnapshot: "" })]));
  it("denies empty policy snapshot", () => denied([consent({ policySnapshot: "" })]));
  it("denies empty scopes", () => denied([consent({ scopes: [] })]));
  it("denies tampered digest", () => denied([consent({}, true)]));
  it("normalizes duplicated and reordered scopes in the digest", () => {
    expect(projectContentConsentDigest({ ...consent(), scopes: ["read", "metadata", "read"] })).toBe(projectContentConsentDigest({ ...consent(), scopes: ["metadata", "read"] }));
  });

  it("authorizes valid consent", async () => {
    const value = fixture([consent()]);
    await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).resolves.toEqual({ ok: true });

    expect(value.calls()).toBe(1);
  });

});


describe("gateway cancellation and timeout", () => {
  it("records CALL_CANCELLED for an already-aborted caller signal before dispatch", async () => {
    const value = fixture([consent()]); const controller = new AbortController(); controller.abort();
    await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy", signal: controller.signal })).rejects.toThrow();
    expect(value.calls()).toBe(0); expect(value.gateway.auditEvents().at(-1)?.code).toBe("CALL_CANCELLED");
  });

  it("records CALL_TIMED_OUT for an elapsed deadline before dispatch", async () => {
    const value = fixture([consent()]);
    await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy", deadline: "2026-08-03T00:00:00.000Z" })).rejects.toThrow();
    expect(value.calls()).toBe(0); expect(value.gateway.auditEvents().at(-1)?.code).toBe("CALL_TIMED_OUT");
  });

  it("records KILL_SWITCH before dispatch", async () => {
    const value = fixture([consent()]); value.gateway.kill();
    await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).rejects.toThrow();
    expect(value.calls()).toBe(0); expect(value.gateway.auditEvents().at(-1)?.code).toBe("KILL_SWITCH");
  });

});


describe("in-flight gateway aborts", () => {
  it("cancels a pending provider, releases quota, and suppresses late output", async () => {
    const entered = deferred<void>(); const result = deferred<{ ok: boolean }>(); let providerSignal: AbortSignal | undefined;
    const value = fixture([consent()], async (signal) => { providerSignal = signal; entered.resolve(); return result.promise; });
 const controller = new AbortController();
    const pending = value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy", signal: controller.signal });

    await entered.promise; controller.abort(); await expect(pending).rejects.toThrow();
    expect(providerSignal?.aborted).toBe(true);
    const record = value.grants.readCanonical(value.grant.id); expect(record?.reservedCalls).toBe(0); expect(record?.reservedResponseBytes).toBe(0); expect(record?.callsUsed).toBe(0); expect(record?.responseBytesUsed).toBe(0);
    expect(value.gateway.auditEvents().filter((event) => event.code === "CALL_CANCELLED")).toHaveLength(1);
    result.resolve({ ok: true });
 await Promise.resolve();
    expect(value.gateway.auditEvents().filter((event) => event.code === "CALL_CANCELLED")).toHaveLength(1);
    const finalRecord = value.grants.readCanonical(value.grant.id); expect(finalRecord?.reservedCalls).toBe(0); expect(finalRecord?.reservedResponseBytes).toBe(0); expect(finalRecord?.callsUsed).toBe(0); expect(finalRecord?.responseBytesUsed).toBe(0);
  });

});


describe("in-flight timeout and kill classification", () => {
  it("times out a pending provider and ignores late provider fulfillment", async () => {
    vi.useFakeTimers(); try {
      const entered = deferred<void>(); const result = deferred<{ ok: boolean }>(); let signal: AbortSignal | undefined;
      const value = fixture([consent()], async (providerSignal) => { signal = providerSignal; entered.resolve(); return result.promise; });

      const pending = value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy", deadline: "2026-08-04T00:00:00.100Z" });

      const rejection = expect(pending).rejects.toThrow(); await entered.promise; await vi.advanceTimersByTimeAsync(100); await rejection; expect(signal?.aborted).toBe(true);
      expect(value.gateway.auditEvents().filter((event) => event.code === "CALL_TIMED_OUT")).toHaveLength(1); result.resolve({ ok: true });
 await Promise.resolve();
      expect(value.gateway.auditEvents().filter((event) => event.code === "CALL_TIMED_OUT")).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });

  it("kills a pending provider once and rejects later dispatch", async () => {
    const entered = deferred<void>(); const result = deferred<{ ok: boolean }>(); let signal: AbortSignal | undefined;
    const value = fixture([consent()], async (providerSignal) => { signal = providerSignal; entered.resolve(); return result.promise; });

    const pending = value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" });
 await entered.promise; value.gateway.kill(); value.gateway.kill(); await expect(pending).rejects.toThrow();
    expect(signal?.aborted).toBe(true); expect(value.gateway.auditEvents().filter((event) => event.code === "KILL_SWITCH")).toHaveLength(1); result.resolve({ ok: true });
 await Promise.resolve();
    await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).rejects.toThrow(); expect(value.calls()).toBe(1);
  });

});


describe("authorization changed during execution", () => {
  it("rejects after revocation during execution and preserves revoked state", async () => {
    const entered = deferred<void>(); const result = deferred<{ ok: boolean }>(); const value = fixture([consent()], async () => { entered.resolve(); return result.promise; });

    const pending = value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" });
 await entered.promise; value.grants.revoke(value.grant, NOW); result.resolve({ ok: true });
 await expect(pending).rejects.toThrow();
    const record = value.grants.readCanonical(value.grant.id); expect(record?.state).toBe("revoked"); expect(record?.reservedCalls).toBe(0); expect(record?.reservedResponseBytes).toBe(0); expect(record?.callsUsed).toBe(0); expect(record?.responseBytesUsed).toBe(0); expect(value.gateway.auditEvents().filter((event) => event.code === "AUTHORIZATION_CHANGED")).toHaveLength(1);
  });

  it("rejects after expiration during execution and releases reservation", async () => {
    let currentTime = NOW; const clock = () => currentTime; const entered = deferred<void>(); const result = deferred<{ ok: boolean }>();
    const value = fixture([consent()], async () => { entered.resolve(); return result.promise; }, clock);
    const pending = value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" });

    await entered.promise; const duringCall = value.grants.readCanonical(value.grant.id); expect(duringCall?.reservedCalls).toBe(1); expect(duringCall?.callsUsed).toBe(0);
    currentTime = "2026-08-04T02:00:00.000Z"; result.resolve({ ok: true });
 await expect(pending).rejects.toThrow();
    const record = value.grants.readCanonical(value.grant.id); expect(record?.reservedCalls).toBe(0); expect(record?.reservedResponseBytes).toBe(0); expect(record?.callsUsed).toBe(0); expect(record?.responseBytesUsed).toBe(0); expect(value.grants.authorize(value.grant, currentTime)).toBeUndefined();
    expect(value.gateway.auditEvents().filter((event) => event.code === "AUTHORIZATION_CHANGED")).toHaveLength(1); expect(value.gateway.auditEvents().filter((event) => event.code === "CALL_CANCELLED")).toHaveLength(0); expect(value.gateway.auditEvents().filter((event) => event.code === "PROVIDER_FAILED")).toHaveLength(0); expect(value.gateway.auditEvents().filter((event) => event.code === "TOOL_CALLED")).toHaveLength(0);
  });

});


describe("first reason and late provider rejection", () => {
  it("handles late provider rejection after caller cancellation", async () => {
    const entered = deferred<void>(); const result = deferred<{ ok: boolean }>(); const value = fixture([consent()], async () => { entered.resolve(); return result.promise; });
 const controller = new AbortController();
    const pending = value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy", signal: controller.signal });
 await entered.promise; const rejected = expect(pending).rejects.toThrow(); controller.abort(); await rejected; result.reject(new Error("late")); await Promise.resolve();
    expect(value.gateway.auditEvents().filter((event) => event.code === "CALL_CANCELLED")).toHaveLength(1); const record = value.grants.readCanonical(value.grant.id); expect(record?.reservedCalls).toBe(0); expect(record?.reservedResponseBytes).toBe(0); expect(record?.callsUsed).toBe(0); expect(record?.responseBytesUsed).toBe(0);
  });

  it("first reason caller then kill remains CALL_CANCELLED", async () => {
    const entered = deferred<void>(); const result = deferred<{ ok: boolean }>(); const value = fixture([consent()], async () => { entered.resolve(); return result.promise; });
 const controller = new AbortController(); const pending = value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy", signal: controller.signal });
 await entered.promise; const rejected = expect(pending).rejects.toThrow(); controller.abort(); value.gateway.kill(); await rejected; expect(value.gateway.auditEvents().filter((event) => event.code === "CALL_CANCELLED")).toHaveLength(1); expect(value.gateway.auditEvents().filter((event) => event.code === "KILL_SWITCH")).toHaveLength(0); result.resolve({ ok: true });

  });

});


describe("missing gateway regressions", () => {
  it("rejects a malformed deadline before reservation or dispatch", async () => {
    const value = fixture([consent()]); await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy", deadline: "not-a-timestamp" })).rejects.toThrow();
    const record = value.grants.readCanonical(value.grant.id); expect(value.calls()).toBe(0); expect(record?.reservedCalls).toBe(0); expect(record?.reservedResponseBytes).toBe(0); expect(record?.callsUsed).toBe(0); expect(record?.responseBytesUsed).toBe(0); expect(value.gateway.auditEvents().filter((event) => event.code === "DEADLINE_INVALID")).toHaveLength(1); expect(value.gateway.auditEvents().filter((event) => event.code === "CALL_TIMED_OUT")).toHaveLength(0);
  });

  it("first reason timeout then kill remains CALL_TIMED_OUT", async () => {
    vi.useFakeTimers(); try { const entered = deferred<void>(); const result = deferred<{ ok: boolean }>(); let signal: AbortSignal | undefined; const value = fixture([consent()], async (s) => { signal = s; entered.resolve(); return result.promise; });
 const pending = value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy", deadline: "2026-08-04T00:00:00.100Z" });
 const rejected = expect(pending).rejects.toThrow(); await entered.promise; await vi.advanceTimersByTimeAsync(100); value.gateway.kill(); await rejected; const events = value.gateway.auditEvents(); expect(signal?.aborted).toBe(true); expect(events.filter((event) => event.code === "CALL_TIMED_OUT")).toHaveLength(1); expect(events.filter((event) => event.code === "KILL_SWITCH")).toHaveLength(0); expect(events.filter((event) => event.code === "CALL_CANCELLED")).toHaveLength(0); const record = value.grants.readCanonical(value.grant.id); expect(record?.reservedCalls).toBe(0); expect(record?.reservedResponseBytes).toBe(0); expect(record?.callsUsed).toBe(0); expect(record?.responseBytesUsed).toBe(0); value.gateway.kill(); await vi.advanceTimersByTimeAsync(100); result.resolve({ ok: true });
 } finally { vi.useRealTimers(); }
  });

  it("first reason kill then caller remains KILL_SWITCH", async () => {
    const entered = deferred<void>(); const result = deferred<{ ok: boolean }>(); const value = fixture([consent()], async () => { entered.resolve(); return result.promise; });
 const controller = new AbortController(); const pending = value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy", signal: controller.signal });
 await entered.promise; const rejected = expect(pending).rejects.toThrow(); value.gateway.kill(); controller.abort(); await rejected; expect(value.gateway.auditEvents().filter((event) => event.code === "KILL_SWITCH")).toHaveLength(1); expect(value.gateway.auditEvents().filter((event) => event.code === "CALL_CANCELLED")).toHaveLength(0); result.resolve({ ok: true });

  });

});


describe("gateway inventory drift", () => {
  it("rejects tool-description drift before provider dispatch", async () => {
    const value = inventoryDriftFixture(); const changed = inventory(); const tool = changed.tools[0]; if (tool === undefined) throw new Error("Expected inventory tool."); changed.tools[0] = { ...tool, description: "Changed description after grant issuance." }; value.replaceInventory(changed);
    await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).rejects.toThrow();
    expect(value.providerCalls()).toBe(0); expect(value.gateway.auditEvents().filter((event) => event.code === "INVENTORY_CHANGED")).toHaveLength(1); expect(value.gateway.auditEvents().some((event) => event.code === "CONSENT_DENIED" || event.code === "INPUT_SCHEMA_FAILED" || event.code === "OUTPUT_SCHEMA_FAILED" || event.code === "PROVIDER_FAILED" || event.code === "TOOL_CALLED")).toBe(false); const record = value.grants.readCanonical(value.grant.id); expect(record?.reservedCalls).toBe(0); expect(record?.reservedResponseBytes).toBe(0); expect(record?.callsUsed).toBe(0); expect(record?.responseBytesUsed).toBe(0);
  });

  it("rejects protocol-version drift before provider dispatch", async () => {
    const value = inventoryDriftFixture(); const changed = inventory(); changed.protocolVersions = [...changed.protocolVersions, "2026-07-01"]; value.replaceInventory(changed);
    await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).rejects.toThrow();
    expect(value.providerCalls()).toBe(0); expect(value.gateway.auditEvents().filter((event) => event.code === "INVENTORY_CHANGED")).toHaveLength(1); const record = value.grants.readCanonical(value.grant.id); expect(record?.reservedCalls).toBe(0); expect(record?.reservedResponseBytes).toBe(0); expect(record?.callsUsed).toBe(0); expect(record?.responseBytesUsed).toBe(0);
  });

  it("rejects extension drift before provider dispatch", async () => {
    const value = inventoryDriftFixture(); const changed = inventory(); changed.extensions = ["project.read"]; value.replaceInventory(changed);
    await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).rejects.toThrow();
    expectInventoryDriftDenied(value);
  });

  it("rejects input-schema drift before provider dispatch", async () => {
    const value = inventoryDriftFixture(); const changed = inventory(); const tool = changed.tools[0]; if (tool === undefined) throw new Error("Expected inventory tool."); changed.tools[0] = { ...tool, inputSchema: { type: "object", required: ["path", "mode"], additionalProperties: false, properties: { path: { type: "string" }, mode: { type: "string" } } } }; value.replaceInventory(changed);
    await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).rejects.toThrow(); expectInventoryDriftDenied(value);
  });

  it("rejects output-schema drift before provider dispatch", async () => {
    const value = inventoryDriftFixture(); const changed = inventory(); const tool = changed.tools[0]; if (tool === undefined) throw new Error("Expected inventory tool."); changed.tools[0] = { ...tool, outputSchema: { type: "object", required: ["ok", "version"], additionalProperties: false, properties: { ok: { type: "boolean" }, version: { type: "string" } } } }; value.replaceInventory(changed);
    await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).rejects.toThrow(); expectInventoryDriftDenied(value);
  });

  it("rejects project-content exposure drift before provider dispatch", async () => {
    const value = inventoryDriftFixture(); const changed = inventory(); const tool = changed.tools[0]; if (tool === undefined) throw new Error("Expected inventory tool."); changed.tools[0] = { ...tool, exposesProjectContent: false }; value.replaceInventory(changed);
    await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).rejects.toThrow(); expectInventoryDriftDenied(value);
  });

  it("rejects read-only classification drift before provider dispatch", async () => {
    const value = inventoryDriftFixture(); const changed = inventory(); const tool = changed.tools[0]; if (tool === undefined) throw new Error("Expected inventory tool."); changed.tools[0] = { ...tool, readOnly: false }; value.replaceInventory(changed);
    await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).rejects.toThrow(); expectInventoryDriftDenied(value);
  });

  it("rejects tool-identity drift before provider dispatch", async () => {
    const value = inventoryDriftFixture(); const changed = inventory(); const tool = changed.tools[0]; if (tool === undefined) throw new Error("Expected inventory tool."); changed.tools[0] = { ...tool, id: "read.renamed" }; value.replaceInventory(changed);
    await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).rejects.toThrow(); expectInventoryDriftDenied(value);
  });

  it("rejects tool-membership drift before provider dispatch", async () => {
    const value = inventoryDriftFixture(); const changed = inventory(); const tool = changed.tools[0]; if (tool === undefined) throw new Error("Expected inventory tool."); changed.tools = [...changed.tools, { ...tool, id: "read.secondary", description: "Read secondary project information." }]; value.replaceInventory(changed);
    await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).rejects.toThrow(); expectInventoryDriftDenied(value);
  });

  it("rejects duplicate provider tool IDs before provider dispatch", async () => {
    const value = inventoryDriftFixture(); const changed = inventory(); const tool = changed.tools[0]; if (tool === undefined) throw new Error("Expected inventory tool."); changed.tools = [tool, { ...tool, description: "Conflicting duplicate tool definition." }]; value.replaceInventory(changed);
    await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).rejects.toThrow("duplicate tool IDs"); expectInvalidInventoryDenied(value);
  });

});


describe("gateway input schema boundary", () => {
  it.each([["rejects input missing a required property before provider dispatch", () => ({})], ["rejects input containing an additional property before provider dispatch", () => ({ path: "x", extra: true })], ["rejects non-JSON input before provider dispatch", () => new Date() as unknown as JsonValue], ["rejects cyclic input before provider dispatch", () => { const value: Record<string, unknown> = { path: "x" }; value.self = value; return value as unknown as JsonValue; }], ["rejects an unsafe input object key before provider dispatch", () => { const value: Record<string, unknown> = { path: "x" }; Object.defineProperty(value, "__proto__", { value: { polluted: true }, enumerable: true });
 return value as unknown as JsonValue; }]])("%s", async (_name, input) => { const value = fixture([consent()]); await expect(value.gateway.call(value.grant, "read", input(), { projectSnapshot: "project", policySnapshot: "policy" })).rejects.toThrow(); expectInputDenied(value); });

});

describe("gateway output schema boundary", () => {
  it.each([["rejects provider output missing a required property and releases reservation", () => ({ bad: true })], ["rejects provider output with an invalid property type and releases reservation", () => ({ ok: "yes" })], ["rejects non-JSON provider output and releases reservation", () => new Date()], ["rejects cyclic provider output and releases reservation", () => { const value: Record<string, unknown> = { ok: true }; value.self = value; return value; }], ["rejects an unsafe provider output key and releases reservation", () => { const value: Record<string, unknown> = { ok: true }; Object.defineProperty(value, "constructor", { value: { polluted: true }, enumerable: true });
 return value; }]])("%s", async (_name, output) => { const value = fixture([consent()], async () => output() as { ok: boolean });
 await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).rejects.toThrow(); expectOutputDenied(value); });

  it("accepts canonical input and output and commits successful accounting once", async () => { const output = { ok: true }; const value = fixture([consent()], async () => output); await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).resolves.toEqual(output); const bytes = new TextEncoder().encode(canonicalJson(output)).byteLength; expect(value.calls()).toBe(1); const record = value.grants.readCanonical(value.grant.id); expect(record?.reservedCalls).toBe(0); expect(record?.reservedResponseBytes).toBe(0); expect(record?.callsUsed).toBe(1); expect(record?.responseBytesUsed).toBe(bytes); expect(value.gateway.auditEvents().filter((event) => event.code === "TOOL_CALLED")).toHaveLength(1); await Promise.resolve(); expect(value.grants.readCanonical(value.grant.id)?.callsUsed).toBe(1); });
});

function expectProviderFailed(value: ReturnType<typeof fixture>): void { const events = value.gateway.auditEvents(); const record = value.grants.readCanonical(value.grant.id); expect(value.calls()).toBe(1); expect(events.filter((event) => event.code === "PROVIDER_FAILED")).toHaveLength(1); for (const code of ["TOOL_CALLED", "INPUT_SCHEMA_FAILED", "OUTPUT_SCHEMA_FAILED", "CALL_CANCELLED", "CALL_TIMED_OUT", "KILL_SWITCH", "AUTHORIZATION_CHANGED"]) expect(events.filter((event) => event.code === code)).toHaveLength(0); expect(record?.reservedCalls).toBe(0); expect(record?.reservedResponseBytes).toBe(0); expect(record?.callsUsed).toBe(0); expect(record?.responseBytesUsed).toBe(0); }
describe("provider failure accounting", () => {
  it.each([["records provider Error", new Error("provider-error")], ["records provider TypeError", new TypeError("provider-type-error")], ["records non-Error provider rejection", "provider-rejection"]])("%s", async (_name, error) => { const value = fixture([consent()], async () => { throw error; }); await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).rejects.toBe(error); expectProviderFailed(value); });
  it.each([["records deferred provider Error rejection", new Error("deferred-error")], ["records deferred provider TypeError rejection", new TypeError("deferred-type-error")]])("%s", async (_name, error) => { const deferredError = deferred<{ ok: boolean }>(); const value = fixture([consent()], async () => deferredError.promise); const pending = value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" }); deferredError.reject(error); await expect(pending).rejects.toBe(error); expectProviderFailed(value); });
  it("allows a successful retry after a provider failure", async () => { let attempt = 0; const failure = new Error("first"); const value = fixture([consent()], async () => { attempt += 1; if (attempt === 1) throw failure; return { ok: true }; }); await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).rejects.toBe(failure); expectProviderFailed(value); await expect(value.gateway.call(value.grant, "read", { path: "x" }, { projectSnapshot: "project", policySnapshot: "policy" })).resolves.toEqual({ ok: true }); const record = value.grants.readCanonical(value.grant.id); expect(value.calls()).toBe(2); expect(record?.callsUsed).toBe(1); expect(value.gateway.auditEvents().filter((event) => event.code === "PROVIDER_FAILED")).toHaveLength(1); expect(value.gateway.auditEvents().filter((event) => event.code === "TOOL_CALLED")).toHaveLength(1); });
});

describe("gateway quota and concurrency", () => {
  const options = { projectSnapshot: "project", policySnapshot: "policy" };
  it("accounts for multibyte output using canonical UTF-8 bytes", async () => { const output = { value: "😀é" }; const bytes = canonicalBytes(output); expect(canonicalJson(output).length).toBeLessThan(bytes); const value = quotaFixture({ maxCalls: 2, maxResponseBytes: bytes + 16, maxTotalResponseBytes: bytes + 32, call: () => output }); await expect(value.gateway.call(value.grant, "read", { path: "x" }, options)).resolves.toEqual(output); const r = value.grants.readCanonical(value.grant.id); expect(r?.callsUsed).toBe(1); expect(r?.responseBytesUsed).toBe(bytes); expect(r?.reservedCalls).toBe(0); expect(r?.reservedResponseBytes).toBe(0); expect(value.gateway.auditEvents().filter((e) => e.code === "TOOL_CALLED")).toHaveLength(1); });
  it("accepts output exactly equal to the per-call UTF-8 byte limit", async () => { const output = { value: "😀é" }; const bytes = canonicalBytes(output); const value = quotaFixture({ maxCalls: 2, maxResponseBytes: bytes, maxTotalResponseBytes: bytes + 32, call: () => output }); await expect(value.gateway.call(value.grant, "read", { path: "x" }, options)).resolves.toEqual(output); expect(value.grants.readCanonical(value.grant.id)?.responseBytesUsed).toBe(bytes); });
  it("rejects multibyte output whose UTF-8 bytes exceed the per-call limit", async () => { const output = { value: "😀" }; const characters = canonicalJson(output).length; const bytes = canonicalBytes(output); expect(bytes).toBeGreaterThan(characters); const value = quotaFixture({ maxCalls: 2, maxResponseBytes: characters, maxTotalResponseBytes: bytes + 64, call: () => output }); await expect(value.gateway.call(value.grant, "read", { path: "x" }, options)).rejects.toThrow("reservation quota"); const r = value.grants.readCanonical(value.grant.id); expect(value.calls()).toBe(1); expect(r?.reservedCalls).toBe(0); expect(r?.reservedResponseBytes).toBe(0); expect(r?.callsUsed).toBe(0); expect(r?.responseBytesUsed).toBe(0); expect(value.gateway.auditEvents().filter((e) => e.code === "TOOL_CALLED" || e.code === "OUTPUT_SCHEMA_FAILED" || e.code === "PROVIDER_FAILED")).toHaveLength(0); });
  it("releases an oversized total-quota attempt and allows an exact fitting retry", async () => { const first = { value: "a" }; const oversized = { value: "😀😀😀" }; const retry = { value: "b" }; const firstBytes = canonicalBytes(first); const retryBytes = canonicalBytes(retry); const oversizedBytes = canonicalBytes(oversized); const value = quotaFixture({ maxCalls: 3, maxResponseBytes: oversizedBytes, maxTotalResponseBytes: firstBytes + retryBytes, call: (n) => n === 1 ? first : n === 2 ? oversized : retry }); await expect(value.gateway.call(value.grant, "read", { path: "x" }, options)).resolves.toEqual(first); await expect(value.gateway.call(value.grant, "read", { path: "x" }, options)).rejects.toThrow("reservation quota"); await expect(value.gateway.call(value.grant, "read", { path: "x" }, options)).resolves.toEqual(retry); const r = value.grants.readCanonical(value.grant.id); expect(value.calls()).toBe(3); expect(r?.callsUsed).toBe(2); expect(r?.responseBytesUsed).toBe(firstBytes + retryBytes); expect(r?.reservedCalls).toBe(0); expect(r?.reservedResponseBytes).toBe(0); });
  it("rejects calls after maxCalls is exhausted without another provider dispatch", async () => { const output = { value: "x" }; const bytes = canonicalBytes(output); const value = quotaFixture({ maxCalls: 1, maxResponseBytes: bytes, maxTotalResponseBytes: bytes, call: () => output }); await value.gateway.call(value.grant, "read", { path: "x" }, options); await expect(value.gateway.call(value.grant, "read", { path: "x" }, options)).rejects.toThrow(); const r = value.grants.readCanonical(value.grant.id); expect(value.calls()).toBe(1); expect(r?.callsUsed).toBe(1); expect(r?.reservedCalls).toBe(0); expect(r?.reservedResponseBytes).toBe(0); });
  it("allows exactly one concurrent caller to reserve the final call", async () => { const entered = deferred<void>(); const result = deferred<JsonValue>(); const output = { value: "winner" }; const bytes = canonicalBytes(output); const value = quotaFixture({ maxCalls: 1, maxResponseBytes: bytes + 16, maxTotalResponseBytes: bytes + 16, call: async () => { entered.resolve(); return result.promise; } }); const first = value.gateway.call(value.grant, "read", { path: "x" }, options); const second = value.gateway.call(value.grant, "read", { path: "x" }, options); const settled = Promise.allSettled([first, second]); await entered.promise; const during = value.grants.readCanonical(value.grant.id); expect(value.calls()).toBe(1); expect(during?.reservedCalls).toBe(1); expect(during?.callsUsed).toBe(0); result.resolve(output); const results = await settled; expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1); expect(results.filter((x) => x.status === "rejected")).toHaveLength(1); const r = value.grants.readCanonical(value.grant.id); expect(value.calls()).toBe(1); expect(r?.reservedCalls).toBe(0); expect(r?.reservedResponseBytes).toBe(0); expect(r?.callsUsed).toBe(1); expect(r?.responseBytesUsed).toBe(bytes); expect(value.gateway.auditEvents().filter((e) => e.code === "TOOL_CALLED")).toHaveLength(1); });
});
