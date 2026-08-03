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

export interface AuditEvent {
  code: string;
  runId: string;
  providerId: string;
  toolId?: string;
  at: string;
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
  return sorted(
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
  )
    .slice(0, request.maxItems)
    .map(({ id, connectorId, category, origin, digest, content }) => ({
      sourceId: id,
      connectorId,
      category,
      origin,
      digest,
      content
    }));
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
  readonly #events: AuditEvent[] = [];

  constructor(
    private readonly provider: ReadOnlyToolProvider,
    private readonly auditTime: () => string
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
      grant.expiresAt <= now ||
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

    const result = this.provider.call(toolId, input);
    const responseBytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
    if (responseBytes > 65_536) {
      event("RESPONSE_TOO_LARGE");
      throw new TypeError("Tool response exceeds limit.");
    }
    event("TOOL_CALLED");
    return result;
  }
}
