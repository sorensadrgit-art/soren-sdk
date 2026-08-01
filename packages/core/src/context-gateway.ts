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
  expiresAt: string;
  reviewed: boolean;
}

export interface ContextRequest {
  requestId: string;
  connectorIds: string[];
  categories: ContextCategory[];
  maxItems: number;
  /** UTF-8 context budget. Omitted preserves the legacy item-only limit. */
  maxBytes?: number;
  now: string;
}

export interface SelectedContext {
  sourceId: string;
  connectorId: string;
  category: ContextCategory;
  origin: string;
  digest: Digest;
  content: string;
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
  runId: string;
  providerId: string;
  toolIds: string[];
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

export interface AuditEvent {
  code: string;
  runId: string;
  providerId: string;
  toolId?: string;
  at: string;
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
  const candidates = sorted(
    sources.filter((source) => {
      if (
        !source.reviewed ||
        !ids.has(source.connectorId) ||
        !categories.has(source.category)
      ) {
        return false;
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
    selected.push({ sourceId: source.id, connectorId: source.connectorId, category: source.category, origin: source.origin, digest: source.digest, content: source.content });
  }
  return selected;
}

export function createRunGrant(
  input: Omit<RunGrant, "digest">,
  inventory: ToolInventory,
  now: string
): RunGrant {
  if (input.providerId !== inventory.providerId) {
    throw new TypeError("Run grant provider does not match tool inventory provider.");
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

  const tools = new Map(inventory.tools.map((tool) => [tool.id, tool]));
  const toolIds = normalizedToolIds(input.toolIds);
  for (const id of toolIds) {
    const tool = tools.get(id);
    if (
      tool === undefined ||
      !tool.readOnly ||
      (tool.exposesProjectContent && !input.allowRemoteProjectContent)
    ) {
      throw new TypeError("Grant exceeds read-only policy.");
    }
  }

  const normalized: Omit<RunGrant, "digest"> = {
    ...input,
    toolIds
  };
  return {
    ...normalized,
    digest: grantDigest(normalized)
  };
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

    const tool = inventory.tools.find((candidate) => candidate.id === toolId);
    if (
      !grant.toolIds.includes(toolId) ||
      tool === undefined ||
      !tool.readOnly ||
      (tool.exposesProjectContent && !grant.allowRemoteProjectContent)
    ) {
      event("TOOL_DENIED");
      throw new TypeError("Tool denied.");
    }

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
    event("TOOL_CALLED");
    return result;
  }
}
