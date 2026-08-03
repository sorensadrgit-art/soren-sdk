import { randomUUID } from "node:crypto";

import type { Digest } from "@soren-sdk/contracts";

import {
  inventoryDigest,
  type ToolInventory
} from "./context-gateway.js";

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
  readonly storeId: string;
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
  readonly state: RunGrantState;
  readonly revision: number;
}

export interface RunGrantRepository {
  issue(record: StoredRunGrant): void;
  read(storeId: string, grantId: string): StoredRunGrant | undefined;
}

function recordKey(storeId: string, grantId: string): string {
  return `${storeId}\u0000${grantId}`;
}

function immutableRecord(record: StoredRunGrant): StoredRunGrant {
  return Object.freeze({
    ...record,
    toolIds: Object.freeze([...record.toolIds]),
    extensions: Object.freeze([...record.extensions])
  });
}

export class InMemoryRunGrantRepository implements RunGrantRepository {
  readonly #records = new Map<string, StoredRunGrant>();

  issue(record: StoredRunGrant): void {
    const key = recordKey(record.storeId, record.id);
    if (this.#records.has(key)) {
      throw new TypeError("Run grant already exists.");
    }
    this.#records.set(key, immutableRecord(record));
  }

  read(storeId: string, grantId: string): StoredRunGrant | undefined {
    return this.#records.get(recordKey(storeId, grantId));
  }
}

export interface RunGrantStoreOptions {
  readonly storeId: string;
  readonly repository: RunGrantRepository;
}

function normalizedStrings(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values)].sort((left, right) => left.localeCompare(right))
  );
}

function requireNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function requireLimit(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
}

function timestamp(value: string, name: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`${name} must be a valid timestamp.`);
  }
  return parsed;
}

export class RunGrantStore {
  readonly #storeId: string;
  readonly #repository: RunGrantRepository;
  readonly #issuedHandles = new WeakMap<object, string>();

  constructor(options: RunGrantStoreOptions) {
    requireNonEmpty(options.storeId, "storeId");
    this.#storeId = options.storeId;
    this.#repository = options.repository;
  }

  issue(
    request: RunGrantRequest,
    inventory: ToolInventory,
    now: string
  ): RunGrant {
    requireNonEmpty(request.runId, "runId");
    requireNonEmpty(request.providerId, "providerId");
    requireNonEmpty(request.protocolVersion, "protocolVersion");
    requireLimit(request.maxCalls, "maxCalls");
    requireLimit(request.maxResponseBytes, "maxResponseBytes");
    requireLimit(request.maxTotalResponseBytes, "maxTotalResponseBytes");

    const issuedAt = timestamp(request.issuedAt, "issuedAt");
    const expiresAt = timestamp(request.expiresAt, "expiresAt");
    const currentTime = timestamp(now, "now");
    if (issuedAt > currentTime || expiresAt <= currentTime) {
      throw new TypeError("Run grant is outside its valid time window.");
    }
    if (request.providerId !== inventory.providerId) {
      throw new TypeError("Run grant provider does not match inventory.");
    }
    if (request.inventoryDigest !== inventoryDigest(inventory)) {
      throw new TypeError("Run grant inventory digest does not match inventory.");
    }
    if (!inventory.protocolVersions.includes(request.protocolVersion)) {
      throw new TypeError("Run grant protocol version is not supported.");
    }

    const inventoryTools = new Map(inventory.tools.map((tool) => [tool.id, tool]));
    const toolIds = normalizedStrings(request.toolIds);
    if (toolIds.length === 0) {
      throw new TypeError("Run grant must authorize at least one tool.");
    }
    for (const toolId of toolIds) {
      const tool = inventoryTools.get(toolId);
      if (tool === undefined || !tool.readOnly || tool.exposesProjectContent) {
        throw new TypeError("Run grant exceeds the read-only tool policy.");
      }
    }

    const id = randomUUID();
    const record = immutableRecord({
      id,
      storeId: this.#storeId,
      runId: request.runId,
      providerId: request.providerId,
      toolIds,
      inventoryDigest: request.inventoryDigest,
      protocolVersion: request.protocolVersion,
      extensions: normalizedStrings(request.extensions),
      issuedAt: request.issuedAt,
      expiresAt: request.expiresAt,
      maxCalls: request.maxCalls,
      maxResponseBytes: request.maxResponseBytes,
      maxTotalResponseBytes: request.maxTotalResponseBytes,
      callsUsed: 0,
      responseBytesUsed: 0,
      state: "active",
      revision: 0
    });
    this.#repository.issue(record);

    const handle = Object.freeze({ id });
    this.#issuedHandles.set(handle, id);
    return handle;
  }

  authorize(grant: RunGrant, now: string): StoredRunGrant | undefined {
    if (typeof grant !== "object" || grant === null) {
      return undefined;
    }
    const issuedId = this.#issuedHandles.get(grant);
    if (issuedId === undefined || issuedId !== grant.id) {
      return undefined;
    }

    const record = this.#repository.read(this.#storeId, issuedId);
    if (
      record === undefined ||
      record.state !== "active" ||
      timestamp(record.expiresAt, "expiresAt") <= timestamp(now, "now")
    ) {
      return undefined;
    }
    return record;
  }

  readCanonical(grantId: string): StoredRunGrant | undefined {
    return this.#repository.read(this.#storeId, grantId);
  }
}
