import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type { Digest } from "@soren-sdk/contracts";

import type {
  CallReservation,
  RunGrantRepository,
  RunGrantState,
  StoredRunGrant
} from "./run-grants.js";

type Row = Record<string, unknown>;

const states = new Set<RunGrantState>(["active", "revoked", "expired", "consumed", "exhausted"]);

function invalid(): never { throw new TypeError("Invalid stored run grant."); }
function text(value: unknown): string { if (typeof value !== "string" || value.trim().length === 0) invalid(); return value; }
function timestamp(value: unknown): string { const result = text(value); if (!Number.isFinite(Date.parse(result))) invalid(); return result; }
function positive(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) invalid(); return value; }
function nonNegative(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid(); return value; }
function state(value: unknown): RunGrantState { if (typeof value !== "string" || !states.has(value as RunGrantState)) invalid(); return value as RunGrantState; }
function digest(value: unknown): Digest { const result = text(value); if (!/^sha256:[0-9a-f]{64}$/.test(result)) invalid(); return result as Digest; }
function tokenHash(value: unknown): string { const result = text(value); if (!/^[0-9a-f]{64}$/.test(result)) invalid(); return result; }
function stringArray(value: unknown): readonly string[] {
  if (typeof value !== "string") invalid();
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { invalid(); }
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string" || entry.trim().length === 0) || new Set(parsed).size !== parsed.length) invalid();
  return Object.freeze([...parsed] as string[]);
}
function active(record: StoredRunGrant, now: string): void {
  if (record.state !== "active") throw new TypeError("Run grant is not active.");
  if (!Number.isFinite(Date.parse(now)) || Date.parse(record.expiresAt) <= Date.parse(now)) throw new TypeError("Run grant has expired.");
}
function revision(record: StoredRunGrant, expected: number): void {
  if (!Number.isSafeInteger(expected) || record.revision !== expected) throw new TypeError("Run grant revision mismatch.");
}

export class SqliteRunGrantRepository implements RunGrantRepository {
  readonly #database: DatabaseSync;

  constructor(path: string) {
    this.#database = new DatabaseSync(path);
    this.#database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
    const version = this.schemaVersion();
    const existing = this.#database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'run_grants'").get() as Row | undefined;
    if (existing !== undefined) {
      const columns = this.#database.prepare("PRAGMA table_info(run_grants)").all() as Row[];
      if (version !== 1 || columns.some((column) => column["name"] === "record")) throw new TypeError("Unsupported SQLite run-grant schema.");
    } else if (version !== 0 && version !== 1) {
      throw new TypeError("Unsupported SQLite run-grant schema.");
    }
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS run_grants (
        issuer_id TEXT NOT NULL, grant_id TEXT NOT NULL, token_hash TEXT NOT NULL,
        run_id TEXT NOT NULL, provider_id TEXT NOT NULL, tool_ids_json TEXT NOT NULL,
        inventory_digest TEXT NOT NULL, protocol_version TEXT NOT NULL, extensions_json TEXT NOT NULL,
        issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, max_calls INTEGER NOT NULL,
        max_response_bytes INTEGER NOT NULL, max_total_response_bytes INTEGER NOT NULL,
        calls_used INTEGER NOT NULL, response_bytes_used INTEGER NOT NULL, state TEXT NOT NULL,
        revision INTEGER NOT NULL, PRIMARY KEY (issuer_id, grant_id),
        CHECK (length(trim(issuer_id)) > 0), CHECK (length(trim(grant_id)) > 0),
        CHECK (max_calls > 0), CHECK (max_response_bytes > 0),
        CHECK (max_total_response_bytes > 0), CHECK (max_response_bytes <= max_total_response_bytes),
        CHECK (calls_used >= 0 AND calls_used <= max_calls),
        CHECK (response_bytes_used >= 0 AND response_bytes_used <= max_total_response_bytes),
        CHECK (revision >= 0), CHECK (state IN ('active', 'revoked', 'expired', 'consumed', 'exhausted'))
      ) STRICT;
      CREATE TABLE IF NOT EXISTS call_reservations (
        reservation_id TEXT PRIMARY KEY, issuer_id TEXT NOT NULL, grant_id TEXT NOT NULL,
        reservation_revision INTEGER NOT NULL, max_response_bytes INTEGER NOT NULL,
        CHECK (length(trim(reservation_id)) > 0), CHECK (reservation_revision >= 0), CHECK (max_response_bytes > 0),
        FOREIGN KEY (issuer_id, grant_id) REFERENCES run_grants (issuer_id, grant_id) ON DELETE CASCADE
      ) STRICT;
      CREATE INDEX IF NOT EXISTS call_reservations_by_grant ON call_reservations (issuer_id, grant_id);
      PRAGMA user_version = 1;
    `);
  }

  schemaVersion(): number {
    const row = this.#database.prepare("PRAGMA user_version").get() as Row | undefined;
    if (row === undefined || typeof row["user_version"] !== "number" || !Number.isSafeInteger(row["user_version"])) throw new TypeError("Unsupported SQLite run-grant schema.");
    return row["user_version"];
  }

  close(): void { this.#database.close(); }

  issue(record: StoredRunGrant): void {
    this.#validateRecord(record);
    if (record.reservedCalls !== 0 || record.reservedResponseBytes !== 0) throw new TypeError("Invalid stored run grant.");
    this.#transaction(() => {
      try {
        this.#database.prepare(`INSERT INTO run_grants (issuer_id, grant_id, token_hash, run_id, provider_id, tool_ids_json, inventory_digest, protocol_version, extensions_json, issued_at, expires_at, max_calls, max_response_bytes, max_total_response_bytes, calls_used, response_bytes_used, state, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          record.issuerId, record.id, record.tokenHash, record.runId, record.providerId, JSON.stringify(record.toolIds), record.inventoryDigest, record.protocolVersion, JSON.stringify(record.extensions), record.issuedAt, record.expiresAt, record.maxCalls, record.maxResponseBytes, record.maxTotalResponseBytes, record.callsUsed, record.responseBytesUsed, record.state, record.revision
        );
      } catch (error) {
        if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) throw new TypeError("Run grant already exists.");
        throw error;
      }
    });
  }

  read(issuerId: string, grantId: string): StoredRunGrant | undefined { return this.#read(issuerId, grantId); }

  reserveCall(issuerId: string, grantId: string, expectedRevision: number, now: string): CallReservation {
    return this.#transaction(() => {
      const record = this.#required(issuerId, grantId);
      revision(record, expectedRevision); active(record, now);
      if (record.callsUsed + record.reservedCalls >= record.maxCalls) throw new TypeError("Run grant call quota exhausted.");
      const remaining = record.maxTotalResponseBytes - record.responseBytesUsed - record.reservedResponseBytes;
      if (!Number.isSafeInteger(remaining) || remaining <= 0) throw new TypeError("Run grant response quota exhausted.");
      const maxResponseBytes = Math.min(record.maxResponseBytes, remaining);
      const nextRevision = record.revision + 1;
      const reservation: CallReservation = Object.freeze({ id: randomUUID(), issuerId, grantId, revision: nextRevision, maxResponseBytes });
      this.#casRevision(record, nextRevision);
      this.#database.prepare("INSERT INTO call_reservations (reservation_id, issuer_id, grant_id, reservation_revision, max_response_bytes) VALUES (?, ?, ?, ?, ?)").run(reservation.id, issuerId, grantId, reservation.revision, reservation.maxResponseBytes);
      return reservation;
    });
  }

  commitCall(reservation: CallReservation, responseBytes: number, now: string): StoredRunGrant {
    if (!Number.isSafeInteger(responseBytes) || responseBytes < 0) throw new TypeError("responseBytes must be a non-negative safe integer.");
    return this.#transaction(() => {
      const stored = this.#reservation(reservation);
      const record = this.#required(stored.issuerId, stored.grantId);
      active(record, now);
      if (responseBytes > stored.maxResponseBytes) throw new TypeError("Run grant response exceeds reservation quota.");
      const calls = record.callsUsed + 1;
      const bytes = record.responseBytesUsed + responseBytes;
      if (!Number.isSafeInteger(calls) || calls > record.maxCalls) throw new TypeError("Run grant call quota exhausted.");
      if (!Number.isSafeInteger(bytes) || bytes > record.maxTotalResponseBytes) throw new TypeError("Run grant response quota exhausted.");
      const nextState: RunGrantState = calls >= record.maxCalls || bytes >= record.maxTotalResponseBytes ? "exhausted" : "active";
      this.#database.prepare("DELETE FROM call_reservations WHERE reservation_id = ?").run(stored.id);
      this.#update(record, { calls, bytes, state: nextState });
      return this.#required(record.issuerId, record.id);
    });
  }

  releaseCall(reservation: CallReservation, now: string): StoredRunGrant {
    void now;
    return this.#transaction(() => {
      const stored = this.#reservation(reservation);
      const record = this.#required(stored.issuerId, stored.grantId);
      this.#database.prepare("DELETE FROM call_reservations WHERE reservation_id = ?").run(stored.id);
      this.#update(record, { calls: record.callsUsed, bytes: record.responseBytesUsed, state: record.state });
      return this.#required(record.issuerId, record.id);
    });
  }

  revoke(issuerId: string, grantId: string, expectedRevision: number, now: string): StoredRunGrant { return this.#transition(issuerId, grantId, expectedRevision, now, "revoked"); }
  consume(issuerId: string, grantId: string, expectedRevision: number, now: string): StoredRunGrant { return this.#transition(issuerId, grantId, expectedRevision, now, "consumed"); }

  expire(issuerId: string, grantId: string, expectedRevision: number, now: string): StoredRunGrant {
    return this.#transaction(() => {
      const record = this.#required(issuerId, grantId); revision(record, expectedRevision);
      if (!Number.isFinite(Date.parse(now)) || Date.parse(record.expiresAt) > Date.parse(now)) throw new TypeError("Run grant is not expired.");
      this.#update(record, { calls: record.callsUsed, bytes: record.responseBytesUsed, state: "expired" });
      return this.#required(issuerId, grantId);
    });
  }

  #transaction<T>(operation: () => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try { const result = operation(); this.#database.exec("COMMIT"); return result; }
    catch (error) { try { this.#database.exec("ROLLBACK"); } catch { /* preserve original error */ } throw error; }
  }

  #read(issuerId: string, grantId: string): StoredRunGrant | undefined {
    const row = this.#database.prepare(`SELECT g.*, (SELECT COUNT(*) FROM call_reservations AS r WHERE r.issuer_id = g.issuer_id AND r.grant_id = g.grant_id) AS reserved_calls, (SELECT COALESCE(SUM(r.max_response_bytes), 0) FROM call_reservations AS r WHERE r.issuer_id = g.issuer_id AND r.grant_id = g.grant_id) AS reserved_response_bytes FROM run_grants AS g WHERE g.issuer_id = ? AND g.grant_id = ?`).get(issuerId, grantId) as Row | undefined;
    return row === undefined ? undefined : this.#decode(row);
  }

  #required(issuerId: string, grantId: string): StoredRunGrant { const record = this.#read(issuerId, grantId); if (record === undefined) throw new TypeError("Unknown run grant."); return record; }

  #decode(row: Row): StoredRunGrant {
    try {
      const issuedAt = timestamp(row["issued_at"]); const expiresAt = timestamp(row["expires_at"]);
      if (Date.parse(expiresAt) <= Date.parse(issuedAt)) invalid();
      const maxCalls = positive(row["max_calls"]); const maxResponseBytes = positive(row["max_response_bytes"]); const maxTotalResponseBytes = positive(row["max_total_response_bytes"]);
      const callsUsed = nonNegative(row["calls_used"]); const responseBytesUsed = nonNegative(row["response_bytes_used"]); const reservedCalls = nonNegative(row["reserved_calls"]); const reservedResponseBytes = nonNegative(row["reserved_response_bytes"]);
      if (maxResponseBytes > maxTotalResponseBytes || callsUsed + reservedCalls > maxCalls || responseBytesUsed + reservedResponseBytes > maxTotalResponseBytes) invalid();
      return Object.freeze({ id: text(row["grant_id"]), issuerId: text(row["issuer_id"]), tokenHash: tokenHash(row["token_hash"]), runId: text(row["run_id"]), providerId: text(row["provider_id"]), toolIds: stringArray(row["tool_ids_json"]), inventoryDigest: digest(row["inventory_digest"]), protocolVersion: text(row["protocol_version"]), extensions: stringArray(row["extensions_json"]), issuedAt, expiresAt, maxCalls, maxResponseBytes, maxTotalResponseBytes, callsUsed, responseBytesUsed, reservedCalls, reservedResponseBytes, state: state(row["state"]), revision: nonNegative(row["revision"]) });
    } catch (error) { if (error instanceof TypeError && error.message === "Invalid stored run grant.") throw error; invalid(); }
  }

  #validateRecord(record: StoredRunGrant): void {
    this.#decode({ grant_id: record.id, issuer_id: record.issuerId, token_hash: record.tokenHash, run_id: record.runId, provider_id: record.providerId, tool_ids_json: JSON.stringify(record.toolIds), inventory_digest: record.inventoryDigest, protocol_version: record.protocolVersion, extensions_json: JSON.stringify(record.extensions), issued_at: record.issuedAt, expires_at: record.expiresAt, max_calls: record.maxCalls, max_response_bytes: record.maxResponseBytes, max_total_response_bytes: record.maxTotalResponseBytes, calls_used: record.callsUsed, response_bytes_used: record.responseBytesUsed, reserved_calls: record.reservedCalls, reserved_response_bytes: record.reservedResponseBytes, state: record.state, revision: record.revision });
  }

  #casRevision(record: StoredRunGrant, nextRevision: number): void {
    const result = this.#database.prepare("UPDATE run_grants SET revision = ? WHERE issuer_id = ? AND grant_id = ? AND revision = ?").run(nextRevision, record.issuerId, record.id, record.revision) as { changes: number };
    if (result.changes !== 1) throw new TypeError("Run grant revision mismatch.");
  }

  #update(record: StoredRunGrant, next: { readonly calls: number; readonly bytes: number; readonly state: RunGrantState }): void {
    const result = this.#database.prepare("UPDATE run_grants SET calls_used = ?, response_bytes_used = ?, state = ?, revision = ? WHERE issuer_id = ? AND grant_id = ? AND revision = ?").run(next.calls, next.bytes, next.state, record.revision + 1, record.issuerId, record.id, record.revision) as { changes: number };
    if (result.changes !== 1) throw new TypeError("Run grant revision mismatch.");
  }

  #reservation(handle: CallReservation): CallReservation {
    const row = this.#database.prepare("SELECT reservation_id, issuer_id, grant_id, reservation_revision, max_response_bytes FROM call_reservations WHERE reservation_id = ?").get(handle.id) as Row | undefined;
    if (row === undefined) throw new TypeError("Unknown call reservation.");
    const stored: CallReservation = Object.freeze({ id: text(row["reservation_id"]), issuerId: text(row["issuer_id"]), grantId: text(row["grant_id"]), revision: nonNegative(row["reservation_revision"]), maxResponseBytes: positive(row["max_response_bytes"]) });
    if (stored.id !== handle.id || stored.issuerId !== handle.issuerId || stored.grantId !== handle.grantId || stored.revision !== handle.revision || stored.maxResponseBytes !== handle.maxResponseBytes) throw new TypeError("Unknown call reservation.");
    return stored;
  }

  #transition(issuerId: string, grantId: string, expectedRevision: number, now: string, nextState: RunGrantState): StoredRunGrant {
    return this.#transaction(() => { const record = this.#required(issuerId, grantId); revision(record, expectedRevision); active(record, now); this.#update(record, { calls: record.callsUsed, bytes: record.responseBytesUsed, state: nextState }); return this.#required(issuerId, grantId); });
  }
}
