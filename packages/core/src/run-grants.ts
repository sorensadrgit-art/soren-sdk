import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "node:crypto";

import type { Digest } from "@soren-sdk/contracts";

import {
  inventoryDigest,
  type ToolInventory
} from "./context-gateway.js";

import { validateInventory } from "./protocol-negotiation.js";

export interface RunGrant {
  readonly id: string;
  readonly token: string;
}

export type RunGrantState =
  | "active"
  | "revoked"
  | "expired"
  | "consumed"
  | "exhausted";

export interface RunGrantRequest {
  readonly runId: string;
  readonly providerId: string;
  readonly toolIds: readonly string[];
  readonly inventoryDigest: Digest;
  readonly protocolVersion: string;
  readonly extensions: readonly string[];
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly maxCalls: number;
  readonly maxResponseBytes: number;
  readonly maxTotalResponseBytes: number;
}

export interface StoredRunGrant {
  readonly id: string;
  readonly issuerId: string;
  readonly tokenHash: string;
  readonly runId: string;
  readonly providerId: string;
  readonly toolIds: readonly string[];
  readonly inventoryDigest: Digest;
  readonly protocolVersion: string;
  readonly extensions: readonly string[];
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly maxCalls: number;
  readonly maxResponseBytes: number;
  readonly maxTotalResponseBytes: number;
  readonly callsUsed: number;
  readonly responseBytesUsed: number;
  readonly reservedCalls: number;
  readonly reservedResponseBytes: number;
  readonly state: RunGrantState;
  readonly revision: number;
}

export interface CallReservation {
  readonly id: string;
  readonly grantId: string;
  readonly issuerId: string;
  readonly revision: number;
  readonly maxResponseBytes: number;
}

export interface RunGrantRepository {
  issue(record: StoredRunGrant): void;
  read(issuerId: string, grantId: string): StoredRunGrant | undefined;
  reserveCall(
    issuerId: string,
    grantId: string,
    expectedRevision: number,
    now: string
  ): CallReservation;
  commitCall(
    reservation: CallReservation,
    responseBytes: number,
    now: string
  ): StoredRunGrant;
  releaseCall(reservation: CallReservation, now: string): StoredRunGrant;
  revoke(
    issuerId: string,
    grantId: string,
    expectedRevision: number,
    now: string
  ): StoredRunGrant;
  consume(
    issuerId: string,
    grantId: string,
    expectedRevision: number,
    now: string
  ): StoredRunGrant;
  expire(
    issuerId: string,
    grantId: string,
    expectedRevision: number,
    now: string
  ): StoredRunGrant;
}

export interface RunGrantStoreOptions {
  readonly issuerId: string;
  readonly repository: RunGrantRepository;
}

function requireText(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function parseTime(value: string, name: string): number {
  requireText(value, name);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`${name} must be a valid timestamp.`);
  }
  return parsed;
}

function safePositive(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
}

function safeNonNegative(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer.`);
  }
}

function normalizedStrings(values: readonly string[], name: string): readonly string[] {
  const normalized = values.map((value) => {
    requireText(value, name);
    return value;
  });
  return Object.freeze([...new Set(normalized)].sort((left, right) => left.localeCompare(right)));
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function tokenMatches(token: string, hash: string): boolean {
  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(tokenHash(token), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function key(issuerId: string, grantId: string): string {
  return `${issuerId}\u0000${grantId}`;
}

function immutable(record: StoredRunGrant): StoredRunGrant {
  return Object.freeze({
    ...record,
    toolIds: Object.freeze([...record.toolIds]),
    extensions: Object.freeze([...record.extensions])
  });
}

function clone(record: StoredRunGrant, changes: Partial<StoredRunGrant>): StoredRunGrant {
  return immutable({ ...record, ...changes, revision: record.revision + 1 });
}

function active(record: StoredRunGrant, now: string): void {
  if (record.state !== "active") {
    throw new TypeError("Run grant is not active.");
  }
  if (parseTime(record.expiresAt, "expiresAt") <= parseTime(now, "now")) {
    throw new TypeError("Run grant has expired.");
  }
}

function requireRevision(record: StoredRunGrant, expectedRevision: number): void {
  if (!Number.isSafeInteger(expectedRevision) || record.revision !== expectedRevision) {
    throw new TypeError("Run grant revision mismatch.");
  }
}

export class InMemoryRunGrantRepository implements RunGrantRepository {
  readonly #records = new Map<string, StoredRunGrant>();
  readonly #reservations = new Map<string, CallReservation>();

  issue(record: StoredRunGrant): void {
    const recordKey = key(record.issuerId, record.id);
    if (this.#records.has(recordKey)) {
      throw new TypeError("Run grant already exists.");
    }
    this.#records.set(recordKey, immutable(record));
  }

  read(issuerId: string, grantId: string): StoredRunGrant | undefined {
    return this.#records.get(key(issuerId, grantId));
  }

  reserveCall(issuerId: string, grantId: string, expectedRevision: number, now: string): CallReservation {
    const recordKey = key(issuerId, grantId);
    const record = this.#records.get(recordKey);
    if (record === undefined) {
      throw new TypeError("Unknown run grant.");
    }
    requireRevision(record, expectedRevision);
    active(record, now);
    if (record.callsUsed + record.reservedCalls >= record.maxCalls) {
      throw new TypeError("Run grant call quota exhausted.");
    }
    const remaining = record.maxTotalResponseBytes - record.responseBytesUsed - record.reservedResponseBytes;
    if (!Number.isSafeInteger(remaining) || remaining <= 0) {
      throw new TypeError("Run grant response quota exhausted.");
    }
    const maxResponseBytes = Math.min(record.maxResponseBytes, remaining);
    const reservation: CallReservation = Object.freeze({
      id: randomUUID(), grantId, issuerId, revision: record.revision + 1, maxResponseBytes
    });
    this.#records.set(recordKey, clone(record, {
      reservedCalls: record.reservedCalls + 1,
      reservedResponseBytes: record.reservedResponseBytes + maxResponseBytes
    }));
    this.#reservations.set(reservation.id, reservation);
    return reservation;
  }

  commitCall(reservation: CallReservation, responseBytes: number, now: string): StoredRunGrant {
    safeNonNegative(responseBytes, "responseBytes");
    const storedReservation = this.#reservations.get(reservation.id);
    if (
      storedReservation === undefined ||
      storedReservation.grantId !== reservation.grantId ||
      storedReservation.issuerId !== reservation.issuerId ||
      storedReservation.revision !== reservation.revision ||
      storedReservation.maxResponseBytes !== reservation.maxResponseBytes
    ) {
      throw new TypeError("Unknown call reservation.");
    }
    if (responseBytes > storedReservation.maxResponseBytes) {
      throw new TypeError("Run grant response exceeds reservation quota.");
    }
    const recordKey = key(storedReservation.issuerId, storedReservation.grantId);
    const record = this.#records.get(recordKey);
    if (record === undefined || record.reservedCalls < 1 || record.reservedResponseBytes < storedReservation.maxResponseBytes) {
      throw new TypeError("Run grant reservation mismatch.");
    }
    active(record, now);
    const bytes = record.responseBytesUsed + responseBytes;
    if (!Number.isSafeInteger(bytes) || bytes > record.maxTotalResponseBytes) {
      throw new TypeError("Run grant response quota exhausted.");
    }
    const calls = record.callsUsed + 1;
    if (!Number.isSafeInteger(calls)) {
      throw new TypeError("Run grant call counter overflow.");
    }
    const state: RunGrantState = calls >= record.maxCalls || bytes >= record.maxTotalResponseBytes ? "exhausted" : "active";
    const next = clone(record, {
      callsUsed: calls,
      responseBytesUsed: bytes,
      reservedCalls: record.reservedCalls - 1,
      reservedResponseBytes: record.reservedResponseBytes - storedReservation.maxResponseBytes,
      state
    });
    this.#records.set(recordKey, next);
    this.#reservations.delete(reservation.id);
    return next;
  }

  releaseCall(reservation: CallReservation, now: string): StoredRunGrant {
    void now;
    const storedReservation = this.#reservations.get(reservation.id);
    if (storedReservation === undefined || storedReservation.grantId !== reservation.grantId || storedReservation.issuerId !== reservation.issuerId) {
      throw new TypeError("Unknown call reservation.");
    }
    const recordKey = key(reservation.issuerId, reservation.grantId);
    const record = this.#records.get(recordKey);
    if (record === undefined || record.reservedCalls < 1 || record.reservedResponseBytes < storedReservation.maxResponseBytes) {
      throw new TypeError("Run grant reservation mismatch.");
    }
    if (storedReservation.grantId !== reservation.grantId || storedReservation.issuerId !== reservation.issuerId) {
      throw new TypeError("Run grant reservation mismatch.");
    }
    const next = clone(record, {
      reservedCalls: record.reservedCalls - 1,
      reservedResponseBytes: record.reservedResponseBytes - storedReservation.maxResponseBytes
    });
    this.#records.set(recordKey, next);
    this.#reservations.delete(reservation.id);
    return next;
  }

  revoke(issuerId: string, grantId: string, expectedRevision: number, now: string): StoredRunGrant {
    return this.#transition(issuerId, grantId, expectedRevision, now, "revoked");
  }

  consume(issuerId: string, grantId: string, expectedRevision: number, now: string): StoredRunGrant {
    return this.#transition(issuerId, grantId, expectedRevision, now, "consumed");
  }

  expire(issuerId: string, grantId: string, expectedRevision: number, now: string): StoredRunGrant {
    const record = this.#required(issuerId, grantId);
    requireRevision(record, expectedRevision);
    if (parseTime(record.expiresAt, "expiresAt") > parseTime(now, "now")) {
      throw new TypeError("Run grant is not expired.");
    }
    const next = clone(record, { state: "expired" });
    this.#records.set(key(issuerId, grantId), next);
    return next;
  }

  #required(issuerId: string, grantId: string): StoredRunGrant {
    const record = this.#records.get(key(issuerId, grantId));
    if (record === undefined) {
      throw new TypeError("Unknown run grant.");
    }
    return record;
  }

  #transition(issuerId: string, grantId: string, expectedRevision: number, now: string, state: RunGrantState): StoredRunGrant {
    const record = this.#required(issuerId, grantId);
    requireRevision(record, expectedRevision);
    active(record, now);
    const next = clone(record, { state });
    this.#records.set(key(issuerId, grantId), next);
    return next;
  }
}

export class RunGrantStore {
  readonly #issuerId: string;
  readonly #repository: RunGrantRepository;

  constructor(options: RunGrantStoreOptions) {
    requireText(options.issuerId, "issuerId");
    this.#issuerId = options.issuerId;
    this.#repository = options.repository;
  }

  issue(request: RunGrantRequest, inventory: ToolInventory, now: string): RunGrant {
    validateInventory(inventory);
    requireText(request.runId, "runId");
    requireText(request.providerId, "providerId");
    requireText(request.protocolVersion, "protocolVersion");
    safePositive(request.maxCalls, "maxCalls");
    safePositive(request.maxResponseBytes, "maxResponseBytes");
    safePositive(request.maxTotalResponseBytes, "maxTotalResponseBytes");
    if (request.maxResponseBytes > request.maxTotalResponseBytes) {
      throw new TypeError("maxResponseBytes cannot exceed maxTotalResponseBytes.");
    }
    const issuedAt = parseTime(request.issuedAt, "issuedAt");
    const expiresAt = parseTime(request.expiresAt, "expiresAt");
    const current = parseTime(now, "now");
    if (issuedAt > current || expiresAt <= current) {
      throw new TypeError("Run grant is outside its valid time window.");
    }
    if (request.providerId !== inventory.providerId || request.inventoryDigest !== inventoryDigest(inventory)) {
      throw new TypeError("Run grant inventory does not match provider.");
    }
    if (!inventory.protocolVersions.includes(request.protocolVersion)) {
      throw new TypeError("Run grant protocol version is not supported.");
    }
    const extensions = normalizedStrings(request.extensions, "extension");
    const supported = new Set(inventory.extensions ?? []);
    for (const extension of extensions) {
      if (!supported.has(extension)) {
        throw new TypeError("Run grant extension is not supported.");
      }
    }
    const toolIds = normalizedStrings(request.toolIds, "toolId");
    if (toolIds.length === 0) {
      throw new TypeError("Run grant must authorize at least one tool.");
    }
    const tools = new Map(inventory.tools.map((tool) => [tool.id, tool]));
    for (const toolId of toolIds) {
      const tool = tools.get(toolId);
      if (tool === undefined || !tool.readOnly) {
        throw new TypeError("Run grant exceeds the read-only tool policy.");
      }
    }
    const token = randomBytes(32).toString("base64url");
    const record: StoredRunGrant = {
      id: randomUUID(), issuerId: this.#issuerId, tokenHash: tokenHash(token),
      runId: request.runId, providerId: request.providerId, toolIds,
      inventoryDigest: request.inventoryDigest, protocolVersion: request.protocolVersion,
      extensions, issuedAt: request.issuedAt, expiresAt: request.expiresAt,
      maxCalls: request.maxCalls, maxResponseBytes: request.maxResponseBytes,
      maxTotalResponseBytes: request.maxTotalResponseBytes, callsUsed: 0,
      responseBytesUsed: 0, reservedCalls: 0, reservedResponseBytes: 0,
      state: "active", revision: 0
    };
    this.#repository.issue(record);
    return Object.freeze({ id: record.id, token });
  }

  authorize(grant: unknown, now: string): StoredRunGrant | undefined {
    if (!this.#validHandle(grant)) return undefined;
    const record = this.#repository.read(this.#issuerId, grant.id);
    if (record === undefined || !tokenMatches(grant.token, record.tokenHash)) return undefined;
    if (record.state !== "active" || parseTime(record.expiresAt, "expiresAt") <= parseTime(now, "now")) return undefined;
    return record;
  }

  reserveCall(grant: RunGrant, now: string): CallReservation {
    const record = this.#authorized(grant, now);
    return this.#repository.reserveCall(this.#issuerId, record.id, record.revision, now);
  }

  commitCall(grant: RunGrant, reservation: CallReservation, responseBytes: number, now: string): StoredRunGrant {
    this.#authorized(grant, now);
    return this.#repository.commitCall(reservation, responseBytes, now);
  }

  releaseCall(grant: RunGrant, reservation: CallReservation, now: string): StoredRunGrant {
    const record = this.#authenticated(grant);
    return this.#repository.releaseCall({ ...reservation, issuerId: record.issuerId, grantId: record.id }, now);
  }

  revoke(grant: RunGrant, now: string): StoredRunGrant {
    const record = this.#authorized(grant, now);
    return this.#repository.revoke(this.#issuerId, record.id, record.revision, now);
  }

  consume(grant: RunGrant, now: string): StoredRunGrant {
    const record = this.#authorized(grant, now);
    return this.#repository.consume(this.#issuerId, record.id, record.revision, now);
  }

  expire(grant: RunGrant, now: string): StoredRunGrant {
    if (!this.#validHandle(grant)) throw new TypeError("Run grant denied.");
    const record = this.#repository.read(this.#issuerId, grant.id);
    if (record === undefined || !tokenMatches(grant.token, record.tokenHash)) throw new TypeError("Run grant denied.");
    return this.#repository.expire(this.#issuerId, record.id, record.revision, now);
  }

  readCanonical(grantId: string): StoredRunGrant | undefined {
    return this.#repository.read(this.#issuerId, grantId);
  }

  #validHandle(grant: unknown): grant is RunGrant {
    return typeof grant === "object" && grant !== null && "id" in grant && "token" in grant && typeof grant.id === "string" && typeof grant.token === "string";
  }

  #authenticated(grant: RunGrant): StoredRunGrant {
    if (!this.#validHandle(grant)) throw new TypeError("Run grant denied.");
    const record = this.#repository.read(this.#issuerId, grant.id);
    if (record === undefined || !tokenMatches(grant.token, record.tokenHash)) throw new TypeError("Run grant denied.");
    return record;
  }

  #authorized(grant: RunGrant, now: string): StoredRunGrant {
    const record = this.authorize(grant, now);
    if (record === undefined) throw new TypeError("Run grant denied.");
    return record;
  }
}
