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

export type JsonSchema = Readonly<Record<string, unknown>>;

export interface ToolDefinition {
  id: string;
  description: string;
  readOnly: boolean;
  exposesProjectContent: boolean;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
}

export interface ToolInventory {
  providerId: string;
  protocolVersions: string[];
  extensions?: string[];
  tools: ToolDefinition[];
}

export interface NegotiationResult {
  providerId: string;
  protocolVersion: string;
  extensions: string[];
  inventoryDigest: Digest;
  digest: Digest;
  createdAt: string;
  expiresAt: string;
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
  /** Persisted negotiation binding. Optional only for input compatibility; issuance fills these. */
  protocolVersion?: string;
  extensions?: string[];
  negotiationDigest?: Digest;
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
    protocolVersions: sorted(inventory.protocolVersions, (left, right) => left.localeCompare(right)),
    extensions: sorted(inventory.extensions ?? [], (left, right) => left.localeCompare(right)),
    tools: sorted(inventory.tools, (left, right) => left.id.localeCompare(right.id)).map(({ id, description, readOnly, exposesProjectContent, inputSchema, outputSchema }) => ({ id, description, readOnly, exposesProjectContent, inputSchema: inputSchema ?? {}, outputSchema: outputSchema ?? {} }))
  } as JsonValue);
}

export function negotiateProtocol(inventory: ToolInventory, supportedVersions: readonly string[], requiredExtensions: readonly string[], createdAt: string, expiresAt: string): NegotiationResult {
  if (expiresAt <= createdAt) throw new TypeError("Negotiation expiration must follow creation.");
  const compatible = [...new Set(supportedVersions)].filter((version) => inventory.protocolVersions.includes(version));
  if (compatible.length === 0) throw new TypeError("No compatible protocol version.");
  const extensions = [...new Set(requiredExtensions)].sort((left, right) => left.localeCompare(right));
  if (extensions.some((extension) => !(inventory.extensions ?? []).includes(extension))) throw new TypeError("Required protocol extension unavailable.");
  const selected = compatible.sort((left, right) => left.localeCompare(right, undefined, { numeric: true })).at(-1);
  if (selected === undefined) throw new TypeError("No compatible protocol version.");
  const protocolVersion = selected;
  const inventoryHash = inventoryDigest(inventory);
  const base = { providerId: inventory.providerId, protocolVersion, extensions, inventoryDigest: inventoryHash, createdAt, expiresAt };
  return { ...base, digest: digestJson(base as unknown as JsonValue) };
}

function validateJson(value: unknown, schema: JsonSchema | undefined, path = "$"): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new TypeError(`Unsupported non-JSON value at ${path}.`); return; }
  if (Array.isArray(value)) { value.forEach((item, index) => validateJson(item, undefined, `${path}[${index}]`)); return; }
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`Unsupported non-JSON value at ${path}.`);
  const object = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(object)) { if (["__proto__", "prototype", "constructor"].includes(key)) throw new TypeError(`Unsafe object key at ${path}.`); validateJson(item, undefined, `${path}.${key}`); }
  if (!schema || schema.type !== "object") return;
  const properties = schema.properties as Record<string, JsonSchema> | undefined;
  for (const key of (schema.required as unknown[] ?? [])) if (typeof key === "string" && !(key in object)) throw new TypeError(`Missing required property: ${key}.`);
  if (schema.additionalProperties === false && properties) for (const key of Object.keys(object)) if (!(key in properties)) throw new TypeError(`Unknown property: ${key}.`);
  if (properties) for (const [key, child] of Object.entries(properties)) if (key in object) validateJson(object[key], child, `${path}.${key}`);
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

  const defaultProtocolVersion = sorted(inventory.protocolVersions, (left, right) => left.localeCompare(right, undefined, { numeric: true })).at(-1);
  const protocolVersion = input.protocolVersion ?? defaultProtocolVersion;
  if (protocolVersion === undefined || !inventory.protocolVersions.includes(protocolVersion)) {
    throw new TypeError("Grant protocol is unavailable.");
  }
  const extensions = sorted([...(new Set(input.extensions ?? []))], (left, right) => left.localeCompare(right));
  const negotiation = negotiateProtocol(inventory, [protocolVersion], extensions, input.issuedAt, input.expiresAt);
  if (input.negotiationDigest !== undefined && input.negotiationDigest !== negotiation.digest) {
    throw new TypeError("Invalid negotiation digest.");
  }
  const normalized: Omit<RunGrant, "digest"> = {
    ...input,
    toolIds,
    protocolVersion,
    extensions,
    negotiationDigest: negotiation.digest
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
    if (
      grant.protocolVersion === undefined ||
      grant.negotiationDigest === undefined ||
      !inventory.protocolVersions.includes(grant.protocolVersion) ||
      grant.negotiationDigest !== negotiateProtocol(inventory, [grant.protocolVersion], grant.extensions ?? [], grant.issuedAt, grant.expiresAt).digest
    ) {
      event("NEGOTIATION_CHANGED");
      throw new TypeError("Negotiated protocol changed.");
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

    try {
      validateJson(input, tool.inputSchema);
    } catch (error) {
      event("INPUT_SCHEMA_FAILED");
      throw error;
    }
    const result = this.provider.call(toolId, input);
    try {
      validateJson(result, tool.outputSchema);
    } catch (error) {
      event("OUTPUT_SCHEMA_FAILED");
      throw error;
    }
    const responseBytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
    if (responseBytes > 65_536) {
      event("RESPONSE_TOO_LARGE");
      throw new TypeError("Tool response exceeds limit.");
    }
    event("TOOL_CALLED");
    return result;
  }
}
