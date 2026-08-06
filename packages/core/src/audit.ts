import { digestJson, type Digest } from "@soren-sdk/contracts";

export interface AuditEventInput { readonly code: string; readonly occurredAt: string; }
export interface StoredAuditEvent { readonly sequence: number; readonly code: string; readonly occurredAt: string; readonly previousDigest: Digest | null; readonly digest: Digest; }
export interface AuditSink { append(event: AuditEventInput): StoredAuditEvent; readAll(): readonly StoredAuditEvent[]; }

function text(value: unknown, name: string): string { if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`Invalid ${name}.`); return value; }
function occurredAt(value: unknown): string { const result = text(value, "occurredAt"); if (!Number.isFinite(Date.parse(result))) throw new TypeError("Invalid occurredAt."); return result; }
function sequence(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new TypeError("Invalid sequence."); return value as number; }
function maybeDigest(value: unknown): Digest | null { if (value === null) return null; if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) throw new TypeError("Invalid previousDigest."); return value as Digest; }

export function auditEventDigest(event: Omit<StoredAuditEvent, "digest">): Digest {
  return digestJson({ sequence: sequence(event.sequence), code: text(event.code, "code"), occurredAt: occurredAt(event.occurredAt), previousDigest: maybeDigest(event.previousDigest) });
}

function immutable(event: StoredAuditEvent): StoredAuditEvent { return Object.freeze({ ...event }); }

export class InMemoryAuditSink implements AuditSink {
  readonly #events: StoredAuditEvent[] = [];
  append(event: AuditEventInput): StoredAuditEvent {
    const previous = this.#events.at(-1); const value: Omit<StoredAuditEvent, "digest"> = { sequence: previous === undefined ? 1 : previous.sequence + 1, code: text(event.code, "code"), occurredAt: occurredAt(event.occurredAt), previousDigest: previous?.digest ?? null };
    const stored = immutable({ ...value, digest: auditEventDigest(value) }); this.#events.push(stored); return stored;
  }
  readAll(): readonly StoredAuditEvent[] { return Object.freeze(this.#events.map((event) => immutable(event))); }
}
