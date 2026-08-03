import { describe, expect, it } from "vitest";

import {
  inventoryDigest,
  ReadOnlyToolGateway,
  RunGrantStore,
  type ReadOnlyToolProvider,
  type ToolInventory
} from "../src/context-gateway.js";

const encoder = new TextEncoder();

function inventory(): ToolInventory {
  return {
    providerId: "fake",
    protocolVersions: ["2025-11-25"],
    tools: [{ id: "read", description: "Read approved metadata.", readOnly: true, exposesProjectContent: false }]
  };
}

function chunks(value: unknown, chunkBytes = 16): AsyncIterable<Uint8Array> {
  const bytes = encoder.encode(JSON.stringify(value));
  return (async function* () {
    for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
      yield bytes.slice(offset, offset + chunkBytes);
    }
  })();
}

function setup(providerCall: ReadOnlyToolProvider["call"], maxBytes = 1_024) {
  const toolInventory = inventory();
  const provider: ReadOnlyToolProvider = { inventory: () => toolInventory, call: providerCall };
  const store = new RunGrantStore({ storeId: crypto.randomUUID() });
  const gateway = new ReadOnlyToolGateway(provider, () => "2099-01-01T01:00:00Z", store);
  const grant = store.issue({
    runId: "run",
    providerId: "fake",
    toolIds: ["read"],
    inventoryDigest: inventoryDigest(toolInventory),
    issuedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2099-01-02T00:00:00Z",
    allowRemoteProjectContent: false,
    maxBytes
  }, toolInventory, "2099-01-01T01:00:00Z");
  return { gateway, grant };
}

describe("Phase 7 asynchronous bounded gateway", () => {
  it("rejects a forged grant before opening a provider stream", async () => {
    let called = false;
    const { gateway } = setup(() => {
      called = true;
      return chunks({ ok: true });
    });

    await expect(gateway.call({ id: "forged" }, "read", {}, {
      deadlineMs: 100,
      maxChunkBytes: 32,
      maxResponseBytes: 128
    })).rejects.toThrow("Grant denied");
    expect(called).toBe(false);
  });

  it("cancels a provider that never resolves", async () => {
    let aborted = false;
    const { gateway, grant } = setup((_toolId, _input, options) => (async function* () {
      options.signal.addEventListener("abort", () => { aborted = true; }, { once: true });
      await new Promise<void>(() => undefined);
    })());

    await expect(gateway.call(grant, "read", {}, {
      deadlineMs: 10,
      maxChunkBytes: 32,
      maxResponseBytes: 128
    })).rejects.toThrow("deadline");
    expect(aborted).toBe(true);
  });

  it("returns at the deadline even when a provider ignores cancellation", async () => {
    const { gateway, grant } = setup(() => (async function* () {
      await new Promise<void>(() => undefined);
    })());

    await expect(gateway.call(grant, "read", {}, {
      deadlineMs: 10,
      maxChunkBytes: 32,
      maxResponseBytes: 128
    })).rejects.toThrow("deadline");
  });

  it("honors caller cancellation while the provider is producing", async () => {
    let aborted = false;
    const controller = new AbortController();
    const { gateway, grant } = setup((_toolId, _input, options) => (async function* () {
      options.signal.addEventListener("abort", () => { aborted = true; }, { once: true });
      await new Promise<void>((resolve) => options.signal.addEventListener("abort", () => resolve(), { once: true }));
    })());
    setTimeout(() => controller.abort(), 5);

    await expect(gateway.call(grant, "read", {}, {
      signal: controller.signal,
      deadlineMs: 100,
      maxChunkBytes: 32,
      maxResponseBytes: 128
    })).rejects.toThrow("cancelled");
    expect(aborted).toBe(true);
  });

  it("aborts immediately when a streamed chunk exceeds the chunk limit", async () => {
    let aborted = false;
    const { gateway, grant } = setup((_toolId, _input, options) => (async function* () {
      options.signal.addEventListener("abort", () => { aborted = true; }, { once: true });
      yield encoder.encode(JSON.stringify({ payload: "x".repeat(128) }));
    })());

    await expect(gateway.call(grant, "read", {}, {
      deadlineMs: 100,
      maxChunkBytes: 16,
      maxResponseBytes: 256
    })).rejects.toThrow("chunk");
    expect(aborted).toBe(true);
  });

  it("aborts when streamed output exceeds the response limit and returns no partial value", async () => {
    let aborted = false;
    const { gateway, grant } = setup((_toolId, _input, options) => (async function* () {
      options.signal.addEventListener("abort", () => { aborted = true; }, { once: true });
      yield encoder.encode('{"value":"first');
      yield encoder.encode(' second"}');
    })());

    await expect(gateway.call(grant, "read", {}, {
      deadlineMs: 100,
      maxChunkBytes: 32,
      maxResponseBytes: 12
    })).rejects.toThrow("response");
    expect(aborted).toBe(true);
  });

  it("aborts when a grant's total byte allowance is exceeded", async () => {
    let aborted = false;
    const { gateway, grant } = setup((_toolId, _input, options) => (async function* () {
      options.signal.addEventListener("abort", () => { aborted = true; }, { once: true });
      yield encoder.encode(JSON.stringify({ value: "too large" }));
    })(), 8);

    await expect(gateway.call(grant, "read", {}, {
      deadlineMs: 100,
      maxChunkBytes: 64,
      maxResponseBytes: 128
    })).rejects.toThrow("grant");
    expect(aborted).toBe(true);
  });

  it("discards partial bytes when a provider fails after yielding", async () => {
    const { gateway, grant } = setup(() => (async function* () {
      yield encoder.encode('{"value":"partial');
      throw new Error("provider failed");
    })());

    await expect(gateway.call(grant, "read", {}, {
      deadlineMs: 100,
      maxChunkBytes: 32,
      maxResponseBytes: 128
    })).rejects.toThrow("provider failed");
  });

  it("returns valid multibyte UTF-8 content near the byte limit", async () => {
    const result = { value: "😀😀😀😀" };
    const encoded = encoder.encode(JSON.stringify(result));
    const { gateway, grant } = setup(() => chunks(result, 5), encoded.byteLength);

    await expect(gateway.call(grant, "read", {}, {
      deadlineMs: 100,
      maxChunkBytes: 5,
      maxResponseBytes: encoded.byteLength
    })).resolves.toEqual(result);
  });
});
