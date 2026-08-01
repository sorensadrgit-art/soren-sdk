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
  call(toolId: string, input: JsonValue): JsonValue;
}

/** A process-bound, opaque handle. Permissions never leave the grant store. */
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
  expiresAt: string;
  allowRemoteProjectContent: boolean;
  /** Defaults to one, making each grant non-replayable. */
  maxCalls?: number;
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
  state: RunGrantState;
}

export interface RunGrantPersistence {
  load(storeId: string): readonly StoredRunGrant[];
  save(storeId: string, grant: StoredRunGrant): void;
}

function copyStoredGrant(grant: StoredRunGrant): StoredRunGrant {
  return Object.freeze({ ...grant, toolIds: Object.freeze([...grant.toolIds]) });
}

/** Test and local adapter. Production storage can implement the same narrow port. */
export class InMemoryRunGrantPersistence implements RunGrantPersistence {
  readonly #stores = new Map<string, Map<string, StoredRunGrant>>();

  load(storeId: string): readonly StoredRunGrant[] {
    return [...(this.#stores.get(storeId)?.values() ?? [])].map(copyStoredGrant);
  }

  save(storeId: string, grant: StoredRunGrant): void {
    const records = this.#stores.get(storeId) ?? new Map<string, StoredRunGrant>();
    records.set(grant.id, copyStoredGrant(grant));
    this.#stores.set(storeId, records);
  }
}

const handleStores = new WeakMap<RunGrant, string>();

function sorted<T>(
  values: readonly T[],
  compare: (left: T, right: T) => number
): T[] {
  return [...values].sort(compare);
}

function normalizedToolIds(toolIds: readonly string[]): string[] {
  return sorted([...new Set(toolIds)], (left, right) => left.localeCompare(right));
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
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

export function selectContext(
  request: ContextRequest,
  sources: readonly SourceRecord[]
): SelectedContext[] {
  if (!Number.isInteger(request.maxItems) || request.maxItems < 0) {
    throw new TypeError("maxItems must be a non-negative integer.");
  }
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

  issue(input: RunGrantRequest, inventory: ToolInventory, now: string): RunGrant {
    if (
      input.providerId !== inventory.providerId ||
      !validTimestamp(input.issuedAt) ||
      !validTimestamp(input.expiresAt) ||
      !validTimestamp(now) ||
      Date.parse(input.expiresAt) <= Date.parse(now) ||
      Date.parse(input.issuedAt) > Date.parse(now) ||
      input.inventoryDigest !== inventoryDigest(inventory)
    ) {
      throw new TypeError("Invalid run grant.");
    }
    const maxCalls = input.maxCalls ?? 1;
    if (!Number.isInteger(maxCalls) || maxCalls < 1) {
      throw new TypeError("Grant maxCalls must be a positive integer.");
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
    const record = copyStoredGrant({
      id: randomUUID(),
      runId: input.runId,
      providerId: input.providerId,
      toolIds,
      inventoryDigest: input.inventoryDigest,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      allowRemoteProjectContent: input.allowRemoteProjectContent,
      maxCalls,
      calls: 0,
      state: "active"
    });
    this.#records.set(record.id, record);
    this.#persist(record);
    return this.#createHandle(record.id);
  }

  revoke(grant: RunGrant): void {
    const record = this.#ownedRecord(grant);
    if (record === undefined) return;
    this.#replace({ ...record, state: "revoked" });
  }

  authorize(grant: RunGrant, now: string): StoredRunGrant | undefined {
    const record = this.#ownedRecord(grant);
    if (record === undefined || !validTimestamp(now)) return undefined;
    if (record.state !== "active") return undefined;
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

export class ReadOnlyToolGateway {
  #killed = false;
  readonly #events: AuditEvent[] = [];

  constructor(
    private readonly provider: ReadOnlyToolProvider,
    private readonly auditTime: () => string,
    private readonly grants: RunGrantStore
  ) {}

  kill(): void {
    this.#killed = true;
  }

  auditEvents(): readonly AuditEvent[] {
    return this.#events.map((event) => ({ ...event }));
  }

  call(
    grant: RunGrant,
    toolId: string,
    input: JsonValue,
    now: string
  ): JsonValue {
    const inventory = this.provider.inventory();
    const event = (code: string, record?: StoredRunGrant) =>
      this.#events.push({
        code,
        runId: record?.runId ?? "unknown",
        providerId: record?.providerId ?? inventory.providerId,
        toolId,
        at: this.auditTime()
      });

    if (this.#killed) {
      event("KILL_SWITCH");
      throw new TypeError("Gateway disabled.");
    }

    const canonical = this.grants.authorize(grant, now);
    if (canonical === undefined || canonical.providerId !== inventory.providerId) {
      event("GRANT_DENIED", canonical);
      throw new TypeError("Grant denied.");
    }
    if (canonical.inventoryDigest !== inventoryDigest(inventory)) {
      event("INVENTORY_CHANGED", canonical);
      throw new TypeError("Tool inventory changed.");
    }

    const tool = inventory.tools.find((candidate) => candidate.id === toolId);
    if (
      !canonical.toolIds.includes(toolId) ||
      tool === undefined ||
      !tool.readOnly ||
      (tool.exposesProjectContent && !canonical.allowRemoteProjectContent)
    ) {
      event("TOOL_DENIED", canonical);
      throw new TypeError("Tool denied.");
    }
    if (this.grants.consume(grant) === undefined) {
      event("GRANT_DENIED", canonical);
      throw new TypeError("Grant denied.");
    }

    const result = this.provider.call(toolId, input);
    const responseBytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
    if (responseBytes > 65_536) {
      event("RESPONSE_TOO_LARGE", canonical);
      throw new TypeError("Tool response exceeds limit.");
    }
    event("TOOL_CALLED", canonical);
    return result;
  }
}
