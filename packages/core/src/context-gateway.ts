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

/** Providers must observe the signal and stop work within their own bounded timeout. */
export interface ReadOnlyToolProvider {
  inventory(): ToolInventory;
  call(toolId: string, input: JsonValue, signal: AbortSignal): JsonValue | Promise<JsonValue>;
}

export interface RunGrant {
  runId: string;
  providerId: string;
  toolIds: string[];
  inventoryDigest: Digest;
  issuedAt: string;
  expiresAt: string;
  allowRemoteProjectContent: boolean;
  digest: Digest;
}

export interface StoredGrantState {
  grantDigest: Digest;
  status: "active" | "revoked";
  revokedAt?: string;
}

export interface AuditEvent {
  code: string;
  runId: string;
  providerId: string;
  toolId?: string;
  callId?: string;
  at: string;
  /** Audit records intentionally exclude tool inputs, outputs, and revocation rationale. */
  redacted: true;
}

interface ActiveCall {
  grant: RunGrant;
  toolId: string;
  controller: AbortController;
  cancellationAudited: boolean;
}

function sorted<T>(
  values: readonly T[],
  compare: (left: T, right: T) => number
): T[] {
  return [...values].sort(compare);
}

function normalizedToolIds(toolIds: readonly string[]): string[] {
  return sorted([...new Set(toolIds)], (left, right) => left.localeCompare(right));
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
  return digestJson(value as unknown as JsonValue);
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

export function createRunGrant(
  input: Omit<RunGrant, "digest">,
  inventory: ToolInventory,
  now: string
): RunGrant {
  if (input.providerId !== inventory.providerId) {
    throw new TypeError("Run grant provider does not match tool inventory provider.");
  }
  if (
    input.expiresAt <= now ||
    input.issuedAt > now ||
    input.inventoryDigest !== inventoryDigest(inventory)
  ) {
    throw new TypeError("Invalid run grant.");
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

export class ReadOnlyToolGateway {
  #killed = false;
  #nextCallId = 0;
  readonly #events: AuditEvent[] = [];
  readonly #grantStates = new Map<Digest, StoredGrantState>();
  readonly #grants = new Map<Digest, RunGrant>();
  readonly #activeCalls = new Map<string, ActiveCall>();
  readonly #cancelledRuns = new Set<string>();

  constructor(
    private readonly provider: ReadOnlyToolProvider,
    private readonly auditTime: () => string
  ) {}

  registerGrant(grant: RunGrant): void {
    const { digest, ...grantBase } = grant;
    if (digest !== grantDigest(grantBase)) {
      throw new TypeError("Invalid run grant.");
    }
    const existing = this.#grantStates.get(grant.digest);
    if (existing?.status === "revoked") {
      throw new TypeError("Grant revoked.");
    }
    this.#grants.set(grant.digest, { ...grant, toolIds: [...grant.toolIds] });
    this.#grantStates.set(grant.digest, { grantDigest: grant.digest, status: "active" });
  }

  grantState(grant: RunGrant): StoredGrantState | undefined {
    const state = this.#grantStates.get(grant.digest);
    return state === undefined ? undefined : { ...state };
  }

  revokeGrant(grant: RunGrant, reason: string): void {
    // Reasons influence neither authorization nor redacted audit content.
    void reason;
    this.registerGrantIfAbsent(grant);
    const revokedAt = this.auditTime();
    this.#grantStates.set(grant.digest, {
      grantDigest: grant.digest,
      status: "revoked",
      revokedAt
    });
    this.event("GRANT_REVOKED", grant, undefined, undefined, revokedAt);
    for (const [callId, active] of this.#activeCalls) {
      if (active.grant.digest === grant.digest) {
        this.cancelActiveCall(callId, active);
      }
    }
  }

  kill(): void {
    if (this.#killed) return;
    this.#killed = true;
    const killedAt = this.auditTime();
    for (const [callId, active] of this.#activeCalls) {
      this.event("KILL_SWITCH", active.grant, active.toolId, callId, killedAt);
      this.cancelActiveCall(callId, active);
    }
  }

  cancelCall(callId: string): boolean {
    const active = this.#activeCalls.get(callId);
    if (active === undefined) return false;
    this.cancelActiveCall(callId, active);
    return true;
  }

  cancelRun(runId: string): void {
    if (this.#cancelledRuns.has(runId)) return;
    this.#cancelledRuns.add(runId);
    for (const grant of this.#grants.values()) {
      if (grant.runId === runId) this.event("CALL_CANCELLED", grant);
    }
    for (const [callId, active] of this.#activeCalls) {
      if (active.grant.runId === runId) this.cancelActiveCall(callId, active);
    }
  }

  auditEvents(): readonly AuditEvent[] {
    return this.#events.map((event) => ({ ...event }));
  }

  async call(
    grant: RunGrant,
    toolId: string,
    input: JsonValue,
    now: string
  ): Promise<JsonValue> {
    const inventory = this.provider.inventory();
    const callId = `${grant.runId}:${++this.#nextCallId}`;
    this.registerGrantIfAbsent(grant);

    if (this.#killed) {
      this.event("KILL_SWITCH", grant, toolId, callId);
      throw new TypeError("Gateway disabled.");
    }
    if (this.#cancelledRuns.has(grant.runId)) {
      this.event("CALL_CANCELLED", grant, toolId, callId);
      throw new TypeError("Call cancelled.");
    }
    this.assertGrantUsable(grant, inventory, now, toolId, callId);

    const tool = inventory.tools.find((candidate) => candidate.id === toolId);
    if (
      !grant.toolIds.includes(toolId) ||
      tool === undefined ||
      !tool.readOnly ||
      (tool.exposesProjectContent && !grant.allowRemoteProjectContent)
    ) {
      this.event("TOOL_DENIED", grant, toolId, callId);
      throw new TypeError("Tool denied.");
    }

    const active: ActiveCall = {
      grant,
      toolId,
      controller: new AbortController(),
      cancellationAudited: false
    };
    this.#activeCalls.set(callId, active);
    try {
      const result = await this.provider.call(toolId, input, active.controller.signal);
      if (active.controller.signal.aborted) {
        this.cancelActiveCall(callId, active);
        throw new TypeError("Call cancelled.");
      }
      this.assertGrantUsable(grant, inventory, this.auditTime(), toolId, callId);
      const responseBytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
      if (responseBytes > 65_536) {
        this.event("RESPONSE_TOO_LARGE", grant, toolId, callId);
        throw new TypeError("Tool response exceeds limit.");
      }
      this.event("TOOL_CALLED", grant, toolId, callId);
      return result;
    } catch (error) {
      if (active.controller.signal.aborted) {
        this.cancelActiveCall(callId, active);
        throw new TypeError("Call cancelled.");
      }
      throw error;
    } finally {
      this.#activeCalls.delete(callId);
    }
  }

  private registerGrantIfAbsent(grant: RunGrant): void {
    if (!this.#grantStates.has(grant.digest)) this.registerGrant(grant);
  }

  private assertGrantUsable(
    grant: RunGrant,
    inventory: ToolInventory,
    now: string,
    toolId: string,
    callId: string
  ): void {
    const { digest, ...grantBase } = grant;
    const state = this.#grantStates.get(grant.digest);
    if (state?.status === "revoked") {
      this.event("GRANT_REVOKED", grant, toolId, callId);
      throw new TypeError("Grant revoked.");
    }
    if (
      grant.providerId !== inventory.providerId ||
      digest !== grantDigest(grantBase)
    ) {
      this.event("GRANT_DENIED", grant, toolId, callId);
      throw new TypeError("Grant denied.");
    }
    if (grant.expiresAt <= now) {
      this.event("GRANT_EXPIRED", grant, toolId, callId);
      throw new TypeError("Grant expired.");
    }
    if (grant.inventoryDigest !== inventoryDigest(inventory)) {
      this.event("INVENTORY_CHANGED", grant, toolId, callId);
      throw new TypeError("Tool inventory changed.");
    }
  }

  private cancelActiveCall(callId: string, active: ActiveCall): void {
    if (!active.cancellationAudited) {
      active.cancellationAudited = true;
      this.event("CALL_CANCELLED", active.grant, active.toolId, callId);
    }
    active.controller.abort();
  }

  private event(
    code: string,
    grant: RunGrant,
    toolId?: string,
    callId?: string,
    at = this.auditTime()
  ): void {
    this.#events.push({
      code,
      runId: grant.runId,
      providerId: grant.providerId,
      ...(toolId === undefined ? {} : { toolId }),
      ...(callId === undefined ? {} : { callId }),
      at,
      redacted: true
    });
  }
}
