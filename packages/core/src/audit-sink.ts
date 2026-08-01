import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { canonicalJson, digestJson, type Digest, type JsonValue } from "@soren-sdk/contracts";

export type AuditCode =
  | "CALL_REQUESTED" | "GRANT_ACCEPTED" | "GRANT_DENIED" | "PROVIDER_DISPATCH"
  | "PROVIDER_FAILURE" | "CALL_TIMED_OUT" | "CALL_CANCELLED" | "GRANT_REVOKED"
  | "INVENTORY_CHANGED" | "SCHEMA_VIOLATION" | "RESPONSE_TOO_LARGE" | "CALL_COMPLETED" | "KILL_SWITCH" | "GRANT_EXPIRED" | "TOOL_DENIED";

export interface AuditEvent {
  id: Digest;
  sequence: number;
  code: AuditCode;
  at: string;
  runId: string;
  providerId: string;
  grantDigest: Digest;
  toolId?: string;
  callId?: string;
  redacted: true;
}

export interface AuditSink {
  append(event: AuditEvent): void;
}

export class InMemoryAuditSink implements AuditSink {
  readonly #events: AuditEvent[] = [];
  append(event: AuditEvent): void { this.#events.push({ ...event }); }
  list(runId?: string): AuditEvent[] { return this.#events.filter((event) => runId === undefined || event.runId === runId).map((event) => ({ ...event })); }
}

export class SqliteAuditSink implements AuditSink {
  readonly #database: DatabaseSync;
  #closed = false;
  constructor(path: string | URL) {
    this.#database = new DatabaseSync(path instanceof URL ? fileURLToPath(path) : path);
    this.#database.exec("CREATE TABLE IF NOT EXISTS tool_audit_events (id TEXT PRIMARY KEY, sequence INTEGER NOT NULL, run_id TEXT NOT NULL, canonical_json TEXT NOT NULL); CREATE INDEX IF NOT EXISTS tool_audit_events_run_order ON tool_audit_events(run_id, sequence ASC, id ASC);");
  }
  append(event: AuditEvent): void {
    this.#assertOpen();
    const payload = canonicalJson(event as unknown as JsonValue);
    const { id, ...identityFields } = event;
    if (digestJson(identityFields as unknown as JsonValue) !== id) throw new TypeError("Audit event identity mismatch.");
    this.#database.prepare("INSERT INTO tool_audit_events (id, sequence, run_id, canonical_json) VALUES (?, ?, ?, ?)").run(event.id, event.sequence, event.runId, payload);
  }
  list(runId: string): AuditEvent[] {
    this.#assertOpen();
    return this.#database.prepare("SELECT canonical_json FROM tool_audit_events WHERE run_id = ? ORDER BY sequence ASC, id ASC").all(runId).map((row) => JSON.parse((row as { canonical_json: string }).canonical_json) as AuditEvent);
  }
  close(): void { if (!this.#closed) { this.#database.close(); this.#closed = true; } }
  #assertOpen(): void { if (this.#closed) throw new Error("Audit sink is closed."); }
}
