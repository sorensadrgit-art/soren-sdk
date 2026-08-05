import { DatabaseSync } from "node:sqlite";

import type { Digest } from "@soren-sdk/contracts";

import { auditEventDigest, type AuditEventInput, type AuditSink, type StoredAuditEvent } from "./audit.js";

type Row = Record<string, unknown>;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
function invalid(): never { throw new TypeError("Invalid stored audit chain."); }
function text(value: unknown): string { if (typeof value !== "string" || value.trim().length === 0) invalid(); return value; }
function time(value: unknown): string { const result = text(value); if (!Number.isFinite(Date.parse(result))) invalid(); return result; }
function sequence(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) invalid(); return value; }
function digest(value: unknown): Digest { if (typeof value !== "string" || !digestPattern.test(value)) invalid(); return value as Digest; }
function previous(value: unknown): Digest | null { return value === null ? null : digest(value); }
function immutable(event: StoredAuditEvent): StoredAuditEvent { return Object.freeze({ ...event }); }

export class SqliteAuditSink implements AuditSink {
  readonly #database: DatabaseSync;
  constructor(path: string) {
    this.#database = new DatabaseSync(path);
    this.#database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
    const version = this.schemaVersion();
    if (version !== 0 && version !== 1) throw new TypeError("Unsupported SQLite audit schema.");
    this.#database.exec(`CREATE TABLE IF NOT EXISTS audit_events (
      sequence INTEGER PRIMARY KEY, code TEXT NOT NULL, occurred_at TEXT NOT NULL, previous_digest TEXT, digest TEXT NOT NULL UNIQUE,
      CHECK (sequence > 0), CHECK (length(trim(code)) > 0),
      CHECK (previous_digest IS NULL OR (length(previous_digest) = 71 AND previous_digest GLOB 'sha256:[0-9a-f]*')),
      CHECK (length(digest) = 71 AND digest GLOB 'sha256:[0-9a-f]*')
    ) STRICT; PRAGMA user_version = 1;`);
  }
  schemaVersion(): number { const row = this.#database.prepare("PRAGMA user_version").get() as Row | undefined; if (row === undefined || typeof row["user_version"] !== "number" || !Number.isSafeInteger(row["user_version"])) throw new TypeError("Unsupported SQLite audit schema."); return row["user_version"]; }
  close(): void { this.#database.close(); }
  append(event: AuditEventInput): StoredAuditEvent {
    const code = text(event.code); const occurredAt = time(event.occurredAt);
    return this.#transaction(() => {
      const prior = this.#database.prepare("SELECT sequence, digest FROM audit_events ORDER BY sequence DESC LIMIT 1").get() as Row | undefined;
      const previousSequence = prior === undefined ? undefined : sequence(prior["sequence"]);
      const previousDigest = prior === undefined ? null : digest(prior["digest"]);
      const value: Omit<StoredAuditEvent, "digest"> = { sequence: previousSequence === undefined ? 1 : previousSequence + 1, code, occurredAt, previousDigest };
      const stored = immutable({ ...value, digest: auditEventDigest(value) });
      this.#database.prepare("INSERT INTO audit_events (sequence, code, occurred_at, previous_digest, digest) VALUES (?, ?, ?, ?, ?)").run(stored.sequence, stored.code, stored.occurredAt, stored.previousDigest, stored.digest);
      return stored;
    });
  }
  readAll(): readonly StoredAuditEvent[] {
    const rows = this.#database.prepare("SELECT sequence, code, occurred_at, previous_digest, digest FROM audit_events ORDER BY sequence ASC").all() as Row[];
    const events = rows.map((row) => this.#decode(row));
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index]; if (event === undefined) invalid();
      if (event.sequence !== index + 1 || (index === 0 ? event.previousDigest !== null : event.previousDigest !== events[index - 1]?.digest)) invalid();
      if (event.digest !== auditEventDigest({ sequence: event.sequence, code: event.code, occurredAt: event.occurredAt, previousDigest: event.previousDigest })) invalid();
    }
    return Object.freeze(events.map((event) => immutable(event)));
  }
  #decode(row: Row): StoredAuditEvent { try { return immutable({ sequence: sequence(row["sequence"]), code: text(row["code"]), occurredAt: time(row["occurred_at"]), previousDigest: previous(row["previous_digest"]), digest: digest(row["digest"]) }); } catch { invalid(); } }
  #transaction<T>(operation: () => T): T { this.#database.exec("BEGIN IMMEDIATE"); try { const result = operation(); this.#database.exec("COMMIT"); return result; } catch (error) { try { this.#database.exec("ROLLBACK"); } catch { /* preserve original */ } throw error; } }
}
