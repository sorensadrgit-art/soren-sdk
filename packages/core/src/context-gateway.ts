import { randomUUID } from "node:crypto";

import {
  digestJson,
  sha256Bytes,
  type Digest,
  type JsonValue
} from "@soren-sdk/contracts";

export type ContextCategory =
  | "api"
  | "ownership"
  | "recipe"
  | "verification";

export interface SourceRecord {
  id: string;
  connectorId: string;
  category: ContextCategory;
  origin: string;
  content: string;
  digest: Digest;
  retrievedAt: string;
  expiresAt: string;
  reviewed: boolean;
}

export interface ContextRequest {
  requestId: string;
  connectorIds: string[];
  categories: ContextCategory[];
  maxItems: number;
  now: string;
}

export interface SelectedContext {
  fragmentId: Digest;
  sourceId: string;
  connectorId: string;
  sourceDigest: Digest;
  contentDigest: Digest;
  origin: string;
  retrievedAt: string;
  expiresAt: string;
  freshnessState: "fresh";
  selectionReason: "reviewed-request-match";
  byteSize: number;
  provenanceDigest: Digest;
  instructionAuthority: "none";
  content: string;
}

function validTimestamp(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

export interface ToolDefinition {
  id: string;
  description: string;
  readOnly: boolean;
  exposesProjectContent: boolean;
}

export interface ToolInventory {
  providerId: string;
  protocolVersions: string[];
  tools: ToolDefinition[];
}

export interface ProviderCallOptions {
  signal: AbortSignal;
}

/** Providers yield encoded JSON chunks. The gateway owns decoding and all limits. */
export interface ReadOnlyToolProvider {
  inventory(): ToolInventory;
  call(toolId: string, input: JsonValue): JsonValue | Promise<JsonValue>;
}

/**
 * A signed-at-creation grant definition. Its quotas are copied into the
 * authoritative RunGrantStore before any provider call and never read from a
 * request object during accounting.
 */
export interface RunGrant {
  readonly id: string;
}

export type RunGrantState =
  | "active"
  | "revoked"
  | "expired"
  | "consumed"
  | "exhausted";

export interface RunGrantRequest {
  runId: string;
  providerId: string;
  toolIds: readonly string[];
  inventoryDigest: Digest;
  issuedAt: string;
  /** Optional deadline. An omitted deadline does not expire the grant. */
  expiresAt?: string;
  allowRemoteProjectContent: boolean;
  /** Maximum provider invocations. Omitted means no grant-specific cap. */
  maxCalls?: number;
  /** Maximum committed UTF-8 JSON response bytes. */
  maxTotalResponseBytes?: number;
  /** Maximum UTF-8 JSON bytes for one response, capped by the gateway limit. */
  maxResponseBytes?: number;
  digest: Digest;
}

/** Immutable canonical data held only by the persistence port and grant store. */
export interface StoredRunGrant {
  id: string;
  runId: string;
  providerId: string;
  toolIds: readonly string[];
  inventoryDigest: Digest;
  issuedAt: string;
  expiresAt: string;
  allowRemoteProjectContent: boolean;
  maxCalls: number;
  calls: number;
  maxBytes: number;
  bytes: number;
  state: RunGrantState;
}

export interface RunGrantPersistence {
  load(storeId: string): readonly StoredRunGrant[];
  save(storeId: string, grant: StoredRunGrant): void;
}

function copyStoredGrant(grant: StoredRunGrant): StoredRunGrant {
  return Object.freeze({ ...grant, toolIds: Object.freeze([...grant.toolIds]) });
}

export interface GrantSnapshot {
  grantId: string;
  runId: string;
  providerId: string;
  revoked: boolean;
  callsUsed: number;
  responseBytesUsed: number;
  responseBytesReserved: number;
}

interface GrantRecord {
  readonly grant: RunGrant;
  revoked: boolean;
  callsUsed: number;
  responseBytesUsed: number;
  responseBytesReserved: number;
  readonly reservations: Map<string, number>;
}

interface GrantReservation {
  grantId: string;
  reservationId: string;
  responseBytesReserved: number;
}

const MAX_RESPONSE_BYTES = 65_536;
const MAX_COUNTER = Number.MAX_SAFE_INTEGER;

function sorted<T>(
  values: readonly T[],
  compare: (left: T, right: T) => number
): T[] {
  return [...values].sort(compare);
}

function normalizedToolIds(toolIds: readonly string[]): string[] {
  return sorted([...new Set(toolIds)], (left, right) => left.localeCompare(right));
}

function requireNonNegativeSafeInteger(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new TypeError(`${name} limit must be a non-negative safe integer.`);
  }
}

function safeAdd(left: number, right: number, name: string): number {
  if (left > MAX_COUNTER - right) {
    throw new TypeError(`${name} counter overflow.`);
  }
  return left + right;
}

function cloneGrant(grant: RunGrant): RunGrant {
  return { ...grant, toolIds: [...grant.toolIds] };
}

export function inventoryDigest(inventory: ToolInventory): Digest {
  return digestJson({
    providerId: inventory.providerId,
    protocolVersions: sorted(
      inventory.protocolVersions,
      (left, right) => left.localeCompare(right)
    ),
    tools: sorted(inventory.tools, (left, right) =>
      left.id.localeCompare(right.id)
    ).map(({ id, description, readOnly, exposesProjectContent }) => ({
      id,
      description,
      readOnly,
      exposesProjectContent
    }))
  } as JsonValue);
}

function grantDigest(value: Omit<RunGrant, "digest">): Digest {
  const definedFields = Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  );
  return digestJson(definedFields as JsonValue);
}

export function selectContext(
  request: ContextRequest,
  sources: readonly SourceRecord[]
): SelectedContext[] {
  if (!Number.isInteger(request.maxItems) || request.maxItems < 0) {
    throw new TypeError("maxItems must be a non-negative integer.");
  }
  requireNonNegativeSafeInteger(request.maxBytes, "maxBytes");
  const ids = new Set(request.connectorIds);
  const categories = new Set(request.categories);
  return sorted(
    sources.filter((source) => {
      if (
        !source.reviewed ||
        !ids.has(source.connectorId) ||
        !categories.has(source.category)
      ) {
        return false;
      }
      if (!validTimestamp(source.retrievedAt) || !validTimestamp(source.expiresAt) || !validTimestamp(request.now) || source.retrievedAt > source.expiresAt || source.retrievedAt > request.now) {
        throw new TypeError(`Invalid source timestamps: ${source.id}.`);
      }
      if (source.expiresAt <= request.now) {
        throw new TypeError(`Source stale: ${source.id}.`);
      }
      if (sha256Bytes(source.content) !== source.digest) {
        throw new TypeError(`Source digest mismatch: ${source.id}.`);
      }
      return true;
    }),
    (left, right) =>
      `${left.connectorId}\u0000${left.category}\u0000${left.id}`.localeCompare(
        `${right.connectorId}\u0000${right.category}\u0000${right.id}`
      )
  );
  const selected: SelectedContext[] = [];
  let bytes = 0;
  for (const source of candidates) {
    if (selected.length >= request.maxItems) break;
    const sourceBytes = new TextEncoder().encode(source.content).byteLength;
    if (request.maxBytes !== undefined && (sourceBytes > request.maxBytes || bytes + sourceBytes > request.maxBytes)) continue;
    bytes += sourceBytes;
    const contentDigest = sha256Bytes(source.content);
    const provenanceDigest = digestJson({ sourceId: source.id, connectorId: source.connectorId, sourceDigest: source.digest, contentDigest, origin: source.origin, retrievedAt: source.retrievedAt, expiresAt: source.expiresAt } as JsonValue);
    selected.push(Object.freeze({ fragmentId: digestJson({ provenanceDigest, selectionReason: "reviewed-request-match" } as JsonValue), sourceId: source.id, connectorId: source.connectorId, sourceDigest: source.digest, contentDigest, origin: source.origin, retrievedAt: source.retrievedAt, expiresAt: source.expiresAt, freshnessState: "fresh", selectionReason: "reviewed-request-match", byteSize: sourceBytes, provenanceDigest, instructionAuthority: "none", content: source.content }));
  }
  return selected;
}

export class RunGrantStore {
  readonly #records = new Map<string, StoredRunGrant>();
  readonly #persistence: RunGrantPersistence | undefined;
  readonly #storeId: string;

  constructor(options: { storeId: string; persistence?: RunGrantPersistence }) {
    if (options.storeId.length === 0) {
      throw new TypeError("Grant store id must not be empty.");
    }
    this.#storeId = options.storeId;
    this.#persistence = options.persistence;
    for (const record of options.persistence?.load(options.storeId) ?? []) {
      this.#records.set(record.id, copyStoredGrant(record));
    }
  }
  if (
    (input.expiresAt !== undefined && input.expiresAt <= now) ||
    input.issuedAt > now ||
    input.inventoryDigest !== inventoryDigest(inventory)
  ) {
    throw new TypeError("Invalid run grant.");
  }
  requireNonNegativeSafeInteger(input.maxCalls, "maxCalls");
  requireNonNegativeSafeInteger(input.maxTotalResponseBytes, "maxTotalResponseBytes");
  requireNonNegativeSafeInteger(input.maxResponseBytes, "maxResponseBytes");
  if (input.maxResponseBytes !== undefined && input.maxResponseBytes > MAX_RESPONSE_BYTES) {
    throw new TypeError(`maxResponseBytes limit must not exceed ${MAX_RESPONSE_BYTES}.`);
  }

  revoke(grant: RunGrant): void {
    const record = this.#ownedRecord(grant);
    if (record === undefined) return;
    this.#replace({ ...record, state: "revoked" });
  }

  authorize(grant: RunGrant, now: string): StoredRunGrant | undefined {
    const record = this.#ownedRecord(grant);
    if (record === undefined || !validTimestamp(now)) return undefined;
    if (record.state !== "active" || Date.parse(record.issuedAt) > Date.parse(now)) return undefined;
    if (Date.parse(record.expiresAt) <= Date.parse(now)) {
      this.#replace({ ...record, state: "expired" });
      return undefined;
    }
    return record;
  }

  consume(grant: RunGrant): StoredRunGrant | undefined {
    const record = this.#ownedRecord(grant);
    if (record === undefined || record.state !== "active") return undefined;
    const calls = record.calls + 1;
    const state: RunGrantState = calls >= record.maxCalls
      ? record.maxCalls === 1 ? "consumed" : "exhausted"
      : "active";
    return this.#replace({ ...record, calls, state });
  }

  chargeBytes(grant: RunGrant, amount: number): StoredRunGrant | undefined {
    const record = this.#ownedRecord(grant);
    if (
      record === undefined ||
      !Number.isInteger(amount) ||
      amount < 0 ||
      record.state === "revoked" ||
      record.state === "expired" ||
      record.state === "exhausted" ||
      record.bytes + amount > record.maxBytes
    ) {
      return undefined;
    }
    const bytes = record.bytes + amount;
    const state: RunGrantState = bytes === record.maxBytes && record.state === "active"
      ? "exhausted"
      : record.state;
    return this.#replace({ ...record, bytes, state });
  }

  #createHandle(id: string): RunGrant {
    const handle = Object.freeze({ id });
    handleStores.set(handle, this.#storeId);
    return handle;
  }

  #ownedRecord(grant: RunGrant): StoredRunGrant | undefined {
    if (typeof grant !== "object" || grant === null || handleStores.get(grant) !== this.#storeId) {
      return undefined;
    }
    return this.#records.get(grant.id);
  }

  #replace(record: StoredRunGrant): StoredRunGrant {
    const immutable = copyStoredGrant(record);
    this.#records.set(immutable.id, immutable);
    this.#persist(immutable);
    return immutable;
  }

  #persist(record: StoredRunGrant): void {
    this.#persistence?.save(this.#storeId, record);
  }
}

export interface AuditEvent {
  code: string;
  runId: string;
  providerId: string;
  toolId?: string;
  at: string;
}

/** In-memory reference store. Production storage must provide equivalent atomic transitions. */
export class RunGrantStore {
  readonly #records = new Map<string, GrantRecord>();

  issue(grant: RunGrant): string {
    const { digest, ...grantBase } = grant;
    if (digest !== grantDigest(grantBase)) {
      throw new TypeError("Invalid run grant.");
    }
    const grantId = randomUUID();
    this.#records.set(grantId, {
      grant: cloneGrant(grant),
      revoked: false,
      callsUsed: 0,
      responseBytesUsed: 0,
      responseBytesReserved: 0,
      reservations: new Map()
    });
    return grantId;
  }

  revoke(grantId: string): void {
    const record = this.#records.get(grantId);
    if (record === undefined) throw new TypeError("Unknown grant.");
    record.revoked = true;
  }

  snapshot(grantId: string): GrantSnapshot | undefined {
    const record = this.#records.get(grantId);
    if (record === undefined) return undefined;
    return {
      grantId,
      runId: record.grant.runId,
      providerId: record.grant.providerId,
      revoked: record.revoked,
      callsUsed: record.callsUsed,
      responseBytesUsed: record.responseBytesUsed,
      responseBytesReserved: record.responseBytesReserved
    };
  }

  grant(grantId: string): RunGrant {
    const record = this.#records.get(grantId);
    if (record === undefined) throw new TypeError("Unknown grant.");
    return cloneGrant(record.grant);
  }

  reserve(grantId: string, now: string): GrantReservation {
    const record = this.#records.get(grantId);
    if (record === undefined) throw new TypeError("Grant denied.");
    if (record.revoked) throw new TypeError("Grant revoked.");
    if (record.grant.expiresAt !== undefined && record.grant.expiresAt <= now) {
      throw new TypeError("Grant expired.");
    }
    if (
      (record.grant.maxCalls !== undefined && record.callsUsed >= record.grant.maxCalls) ||
      record.callsUsed >= MAX_COUNTER
    ) {
      throw new TypeError("Grant quota exhausted.");
    }

    const maxResponseBytes = record.grant.maxResponseBytes ?? MAX_RESPONSE_BYTES;
    const availableResponseBytes = record.grant.maxTotalResponseBytes === undefined
      ? maxResponseBytes
      : record.grant.maxTotalResponseBytes - record.responseBytesUsed - record.responseBytesReserved;
    const responseBytesReserved = Math.min(maxResponseBytes, availableResponseBytes);
    if (responseBytesReserved <= 0) {
      throw new TypeError("Grant quota exhausted.");
    }

    record.callsUsed = safeAdd(record.callsUsed, 1, "Grant calls");
    record.responseBytesReserved = safeAdd(
      record.responseBytesReserved,
      responseBytesReserved,
      "Grant response bytes"
    );
    const reservationId = randomUUID();
    record.reservations.set(reservationId, responseBytesReserved);
    return { grantId, reservationId, responseBytesReserved };
  }

  commitResponse(reservation: GrantReservation, responseBytes: number): void {
    const record = this.requireReservation(reservation);
    if (!Number.isSafeInteger(responseBytes) || responseBytes < 0) {
      this.releaseReservation(record, reservation.reservationId);
      throw new TypeError("Tool response byte count is invalid.");
    }
    if (responseBytes > reservation.responseBytesReserved) {
      this.releaseReservation(record, reservation.reservationId);
      throw new TypeError("Tool response exceeds limit.");
    }
    this.releaseReservation(record, reservation.reservationId);
    record.responseBytesUsed = safeAdd(record.responseBytesUsed, responseBytes, "Grant response bytes");
  }

  releaseFailedCall(reservation: GrantReservation): void {
    const record = this.requireReservation(reservation);
    this.releaseReservation(record, reservation.reservationId);
  }

  private requireReservation(reservation: GrantReservation): GrantRecord {
    const record = this.#records.get(reservation.grantId);
    if (record === undefined || !record.reservations.has(reservation.reservationId)) {
      throw new TypeError("Unknown grant reservation.");
    }
    return record;
  }

  private releaseReservation(record: GrantRecord, reservationId: string): void {
    const reservedBytes = record.reservations.get(reservationId);
    if (reservedBytes === undefined) throw new TypeError("Unknown grant reservation.");
    record.reservations.delete(reservationId);
    record.responseBytesReserved -= reservedBytes;
  }
}

export class ReadOnlyToolGateway {
  #killed = false;
  readonly #events: AuditEvent[] = [];
  readonly #grants: RunGrantStore;

  constructor(
    private readonly provider: ReadOnlyToolProvider,
    private readonly auditTime: () => string,
    grantStore = new RunGrantStore()
  ) {
    this.#grants = grantStore;
  }

  kill(): void {
    this.#killed = true;
  }

  issueGrant(grant: RunGrant): string {
    return this.#grants.issue(grant);
  }

  revokeGrant(grantId: string): void {
    this.#grants.revoke(grantId);
  }

  grantSnapshot(grantId: string): GrantSnapshot | undefined {
    return this.#grants.snapshot(grantId);
  }

  auditEvents(): readonly AuditEvent[] {
    return this.#events.map((event) => ({ ...event }));
  }

  async call(
    grantId: string,
    toolId: string,
    input: JsonValue,
    now: string
  ): Promise<JsonValue> {
    const grant = this.#grants.grant(grantId);
    const inventory = this.provider.inventory();
    const event = (code: string) =>
      this.#events.push({
        code,
        runId: grant.runId,
        providerId: grant.providerId,
        toolId,
        at: this.auditTime()
      });

    if (this.#killed) {
      event("KILL_SWITCH");
      throw new TypeError("Gateway disabled.");
    }

    const { digest, ...grantBase } = grant;
    if (
      grant.providerId !== inventory.providerId ||
      (grant.expiresAt !== undefined && grant.expiresAt <= now) ||
      digest !== grantDigest(grantBase)
    ) {
      event("GRANT_DENIED");
      throw new TypeError("Grant denied.");
    }
    if (grant.inventoryDigest !== inventoryDigest(inventory)) {
      event("INVENTORY_CHANGED");
      throw new TypeError("Tool inventory changed.");
    }
    if (this.#killed) { event("KILL_SWITCH"); throw new TypeError("Gateway disabled."); }
    const canonical = this.grants.authorize(grant, new Date().toISOString());
    if (canonical === undefined || canonical.providerId !== inventory.providerId) { event("GRANT_DENIED", canonical); throw new TypeError("Grant denied."); }
    if (canonical.inventoryDigest !== inventoryDigest(inventory)) { event("INVENTORY_CHANGED", canonical); throw new TypeError("Tool inventory changed."); }
    const tool = inventory.tools.find((candidate) => candidate.id === toolId);
    if (!canonical.toolIds.includes(toolId) || tool === undefined || !tool.readOnly || (tool.exposesProjectContent && !canonical.allowRemoteProjectContent)) { event("TOOL_DENIED", canonical); throw new TypeError("Tool denied."); }
    if (this.grants.consume(grant) === undefined) { event("GRANT_DENIED", canonical); throw new TypeError("Grant denied."); }

    let reservation: GrantReservation;
    try {
      reservation = this.#grants.reserve(grantId, now);
    } catch (error) {
      event("GRANT_QUOTA_DENIED");
      throw error;
    }

    let result: JsonValue;
    try {
      result = await this.provider.call(toolId, input);
    } catch (error) {
      this.#grants.releaseFailedCall(reservation);
      event("PROVIDER_FAILED");
      throw error;
    }

    let responseBytes: number;
    try {
      responseBytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
    } catch (error) {
      this.#grants.releaseFailedCall(reservation);
      event("RESPONSE_INVALID");
      throw error;
    }

    try {
      this.#grants.commitResponse(reservation, responseBytes);
    } catch (error) {
      event("RESPONSE_TOO_LARGE");
      throw error;
    }
  }
}
