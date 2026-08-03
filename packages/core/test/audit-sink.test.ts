import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { digestJson } from "@soren-sdk/contracts";
import { describe, expect, it } from "vitest";

import {
  createRunGrant,
  InMemoryAuditSink,
  inventoryDigest,
  ReadOnlyToolGateway,
  SqliteAuditSink,
  type AuditSink,
  type ToolInventory
} from "../src/index.js";

function inventory(): ToolInventory {
  return { providerId: "fake", protocolVersions: ["2025-11-25"], tools: [{ id: "read", description: "Read.", readOnly: true, exposesProjectContent: false }] };
}

function grant(toolInventory: ToolInventory) {
  return createRunGrant({ runId: "run", providerId: "fake", toolIds: ["read"], inventoryDigest: inventoryDigest(toolInventory), issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-02T00:00:00Z", allowRemoteProjectContent: false }, toolInventory, "2026-01-01T01:00:00Z");
}

describe("durable Phase 7 audit sink", () => {
  it("records deterministic redacted lifecycle events without request or response bodies", async () => {
    const toolInventory = inventory();
    const sink = new InMemoryAuditSink();
    const gateway = new ReadOnlyToolGateway({ inventory: () => toolInventory, call: async () => ({ secret: "provider-output" }) }, () => "2026-01-01T01:00:00Z", sink);

    await expect(gateway.call(grant(toolInventory), "read", { secret: "tool-input" }, "2026-01-01T01:00:00Z")).resolves.toEqual({ secret: "provider-output" });
    const events = sink.list();
    expect(events.map((event) => event.code)).toEqual(["CALL_REQUESTED", "GRANT_ACCEPTED", "PROVIDER_DISPATCH", "CALL_COMPLETED"]);
    expect(events.every((event) => event.redacted)).toBe(true);
    expect(JSON.stringify(events)).not.toContain("tool-input");
    expect(JSON.stringify(events)).not.toContain("provider-output");
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
  });

  it("fails closed before provider dispatch when the audit sink fails", async () => {
    const toolInventory = inventory();
    let dispatched = false;
    const failingSink: AuditSink = { append: () => { throw new Error("disk unavailable"); } };
    const gateway = new ReadOnlyToolGateway({ inventory: () => toolInventory, call: async () => { dispatched = true; return { ok: true }; } }, () => "2026-01-01T01:00:00Z", failingSink);

    await expect(gateway.call(grant(toolInventory), "read", {}, "2026-01-01T01:00:00Z")).rejects.toThrow("Audit sink unavailable");
    expect(dispatched).toBe(false);
  });

  it("persists and reopens ordered content-addressed records", async () => {
    const directory = await mkdtemp(join(tmpdir(), "soren-audit-"));
    const databasePath = join(directory, "audit.sqlite");
    try {
      const sink = new SqliteAuditSink(databasePath);
      const event = { sequence: 1, code: "CALL_REQUESTED" as const, at: "2026-01-01T00:00:00Z", runId: "run", providerId: "provider", grantDigest: "sha256:grant" as const, redacted: true as const };
      sink.append({ ...event, id: digestJson(event) });
      sink.close();
      const reopened = new SqliteAuditSink(databasePath);
      expect(reopened.list("run")).toEqual([expect.objectContaining({ id: digestJson(event), sequence: 1, redacted: true })]);
      reopened.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
