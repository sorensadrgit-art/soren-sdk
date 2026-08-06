import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { inventoryDigest, type ToolInventory } from "../src/context-gateway.js";
import { RunGrantStore, type RunGrantRequest } from "../src/run-grants.js";
import { SqliteRunGrantRepository } from "../src/sqlite-run-grants.js";

const NOW = "2026-08-05T12:00:00.000Z";

function inventory(): ToolInventory {
  return {
    providerId: "provider-a",
    protocolVersions: ["2026-08-01"],
    extensions: ["schemas"],
    tools: [{
      id: "read.metadata",
      description: "Read approved metadata.",
      readOnly: true,
      exposesProjectContent: false
    }]
  };
}

function request(value: ToolInventory, overrides: Partial<RunGrantRequest> = {}): RunGrantRequest {
  return {
    runId: "run-1",
    providerId: value.providerId,
    toolIds: ["read.metadata"],
    inventoryDigest: inventoryDigest(value),
    protocolVersion: "2026-08-01",
    extensions: ["schemas"],
    issuedAt: "2026-08-05T11:59:00.000Z",
    expiresAt: "2026-08-05T13:00:00.000Z",
    maxCalls: 1,
    maxResponseBytes: 1024,
    maxTotalResponseBytes: 1024,
    ...overrides
  };
}

function temporaryDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "soren-core-sqlite-"));
  return {
    path: join(directory, "run-grants.sqlite"),
    cleanup(): void { rmSync(directory, { recursive: true, force: true }); }
  };
}

describe("durable SQLite run grants", () => {
  it("creates a restart-readable repository", () => {
    const repository = new SqliteRunGrantRepository(":memory:");
    try { expect(repository.schemaVersion()).toBe(1); } finally { repository.close(); }
  });

  it("persists an issued grant across repository restart", () => {
    const database = temporaryDatabase();
    const value = inventory();
    let grant!: ReturnType<RunGrantStore["issue"]>;
    const first = new SqliteRunGrantRepository(database.path);
    try {
      const grants = new RunGrantStore({ issuerId: "issuer", repository: first });
      grant = grants.issue(request(value), value, NOW);
    } finally { first.close(); }
    const second = new SqliteRunGrantRepository(database.path);
    try {
      const grants = new RunGrantStore({ issuerId: "issuer", repository: second });
      expect(grants.authorize(Object.freeze({ ...grant }), NOW)?.id).toBe(grant.id);
    } finally { second.close(); database.cleanup(); }
  });

  it("makes issued grants visible to an already-open second instance", () => {
    const database = temporaryDatabase();
    const value = inventory();
    const first = new SqliteRunGrantRepository(database.path);
    const second = new SqliteRunGrantRepository(database.path);
    try {
      const firstStore = new RunGrantStore({ issuerId: "issuer", repository: first });
      const secondStore = new RunGrantStore({ issuerId: "issuer", repository: second });
      const grant = firstStore.issue(request(value), value, NOW);
      expect(secondStore.authorize(Object.freeze({ ...grant }), NOW)?.id).toBe(grant.id);
    } finally { first.close(); second.close(); database.cleanup(); }
  });

  it("allows only one repository instance to reserve the final call", () => {
    const database = temporaryDatabase();
    const value = inventory();
    const seed = new SqliteRunGrantRepository(database.path);
    let grant!: ReturnType<RunGrantStore["issue"]>;
    try { grant = new RunGrantStore({ issuerId: "issuer", repository: seed }).issue(request(value), value, NOW); } finally { seed.close(); }
    const first = new SqliteRunGrantRepository(database.path);
    const second = new SqliteRunGrantRepository(database.path);
    try {
      const firstStore = new RunGrantStore({ issuerId: "issuer", repository: first });
      const secondStore = new RunGrantStore({ issuerId: "issuer", repository: second });
      firstStore.reserveCall(grant, NOW);
      expect(() => secondStore.reserveCall(grant, NOW)).toThrow();
      const record = firstStore.readCanonical(grant.id);
      expect((record?.callsUsed ?? 0) + (record?.reservedCalls ?? 0)).toBeLessThanOrEqual(record?.maxCalls ?? 0);
    } finally { first.close(); second.close(); database.cleanup(); }
  });

  it("commits a persisted reservation after repository restart", () => {
    const database = temporaryDatabase();
    const value = inventory();
    const first = new SqliteRunGrantRepository(database.path);
    let grant!: ReturnType<RunGrantStore["issue"]>;
    let reservation!: ReturnType<RunGrantStore["reserveCall"]>;
    try {
      const grants = new RunGrantStore({ issuerId: "issuer", repository: first });
      grant = grants.issue(request(value), value, NOW);
      reservation = grants.reserveCall(grant, NOW);
    } finally { first.close(); }
    const second = new SqliteRunGrantRepository(database.path);
    try {
      const grants = new RunGrantStore({ issuerId: "issuer", repository: second });
      const record = grants.commitCall(grant, reservation, 5, NOW);
      expect(record.reservedCalls).toBe(0);
      expect(record.reservedResponseBytes).toBe(0);
      expect(record.callsUsed).toBe(1);
      expect(record.responseBytesUsed).toBe(5);
    } finally { second.close(); database.cleanup(); }
  });

  it("releases a persisted reservation after revoke and repository restart", () => {
    const database = temporaryDatabase(); const value = inventory(); const first = new SqliteRunGrantRepository(database.path); let grant!: ReturnType<RunGrantStore["issue"]>; let reservation!: ReturnType<RunGrantStore["reserveCall"]>;
    try { const store = new RunGrantStore({ issuerId: "issuer", repository: first }); grant = store.issue(request(value, { maxCalls: 2 }), value, NOW); reservation = store.reserveCall(grant, NOW); store.revoke(grant, NOW); } finally { first.close(); }
    const second = new SqliteRunGrantRepository(database.path);
    try { const record = new RunGrantStore({ issuerId: "issuer", repository: second }).releaseCall(grant, reservation, NOW); expect(record.state).toBe("revoked"); expect(record.reservedCalls).toBe(0); expect(record.reservedResponseBytes).toBe(0); expect(record.callsUsed).toBe(0); expect(record.responseBytesUsed).toBe(0); } finally { second.close(); database.cleanup(); }
  });

  it("commits multiple persisted reservations independently across instances", () => {
    const database = temporaryDatabase(); const value = inventory(); const seed = new SqliteRunGrantRepository(database.path); let grant!: ReturnType<RunGrantStore["issue"]>;
    try { grant = new RunGrantStore({ issuerId: "issuer", repository: seed }).issue(request(value, { maxCalls: 2, maxResponseBytes: 10, maxTotalResponseBytes: 20 }), value, NOW); } finally { seed.close(); }
    const first = new SqliteRunGrantRepository(database.path); const second = new SqliteRunGrantRepository(database.path);
    try { const firstStore = new RunGrantStore({ issuerId: "issuer", repository: first }); const secondStore = new RunGrantStore({ issuerId: "issuer", repository: second }); const one = firstStore.reserveCall(grant, NOW); const two = secondStore.reserveCall(grant, NOW); secondStore.commitCall(grant, two, 4, NOW); const record = firstStore.commitCall(grant, one, 3, NOW); expect(record.callsUsed).toBe(2); expect(record.responseBytesUsed).toBe(7); expect(record.reservedCalls).toBe(0); expect(record.reservedResponseBytes).toBe(0); expect(record.state).toBe("exhausted"); } finally { first.close(); second.close(); database.cleanup(); }
  });

  it("rolls back an oversized commit without losing its reservation", () => {
    const database = temporaryDatabase(); const value = inventory(); const repository = new SqliteRunGrantRepository(database.path);
    try { const store = new RunGrantStore({ issuerId: "issuer", repository }); const grant = store.issue(request(value, { maxResponseBytes: 4, maxTotalResponseBytes: 4 }), value, NOW); const reservation = store.reserveCall(grant, NOW); expect(() => store.commitCall(grant, reservation, 5, NOW)).toThrow(); const held = store.readCanonical(grant.id); expect(held?.reservedCalls).toBe(1); expect(held?.reservedResponseBytes).toBe(4); expect(held?.callsUsed).toBe(0); expect(held?.responseBytesUsed).toBe(0); const released = store.releaseCall(grant, reservation, NOW); expect(released.reservedCalls).toBe(0); expect(released.reservedResponseBytes).toBe(0); } finally { repository.close(); database.cleanup(); }
  });

  it("rejects malformed persisted grant arrays", () => {
    const database = temporaryDatabase(); const value = inventory(); const repository = new SqliteRunGrantRepository(database.path); let grant!: ReturnType<RunGrantStore["issue"]>;
    try { grant = new RunGrantStore({ issuerId: "issuer", repository }).issue(request(value), value, NOW); } finally { repository.close(); }
    const raw = new DatabaseSync(database.path); try { raw.prepare("UPDATE run_grants SET tool_ids_json = '[1]' WHERE issuer_id = 'issuer'").run(); } finally { raw.close(); }
    const reopened = new SqliteRunGrantRepository(database.path); try { expect(() => new RunGrantStore({ issuerId: "issuer", repository: reopened }).readCanonical(grant.id)).toThrow("Invalid stored run grant."); } finally { reopened.close(); database.cleanup(); }
  });

  it("rejects persisted reservations that exceed the grant quota", () => {
    const database = temporaryDatabase(); const value = inventory(); const repository = new SqliteRunGrantRepository(database.path); let grant!: ReturnType<RunGrantStore["issue"]>;
    try { grant = new RunGrantStore({ issuerId: "issuer", repository }).issue(request(value), value, NOW); } finally { repository.close(); }
    const raw = new DatabaseSync(database.path); try { const insert = raw.prepare("INSERT INTO call_reservations (reservation_id, issuer_id, grant_id, reservation_revision, max_response_bytes) VALUES (?, ?, ?, ?, ?)"); insert.run(randomUUID(), "issuer", grant.id, 1, 512); insert.run(randomUUID(), "issuer", grant.id, 2, 512); } finally { raw.close(); }
    const reopened = new SqliteRunGrantRepository(database.path); try { expect(() => new RunGrantStore({ issuerId: "issuer", repository: reopened }).readCanonical(grant.id)).toThrow("Invalid stored run grant."); } finally { reopened.close(); database.cleanup(); }
  });
});
