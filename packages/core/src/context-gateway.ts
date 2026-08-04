import {
  digestJson,
  sha256Bytes,
  type Digest,
  type JsonValue
} from "@soren-sdk/contracts";

export type ContextCategory = "api" | "ownership" | "recipe" | "verification";

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
  inputSchema?: JsonValue;
  outputSchema?: JsonValue;
}

export interface ToolInventory {
  providerId: string;
  protocolVersions: string[];
  extensions?: string[];
  tools: ToolDefinition[];
}

function sorted<T>(values: readonly T[], compare: (left: T, right: T) => number): T[] {
  return [...values].sort(compare);
}

export function inventoryDigest(inventory: ToolInventory): Digest {
  return digestJson({
    providerId: inventory.providerId,
    protocolVersions: sorted([...new Set(inventory.protocolVersions)], (left, right) => left.localeCompare(right)),
    extensions: sorted([...new Set(inventory.extensions ?? [])], (left, right) => left.localeCompare(right)),
    tools: sorted(inventory.tools, (left, right) => left.id.localeCompare(right.id)).map((tool) => ({
      id: tool.id,
      description: tool.description,
      readOnly: tool.readOnly,
      exposesProjectContent: tool.exposesProjectContent,
      inputSchema: tool.inputSchema ?? null,
      outputSchema: tool.outputSchema ?? null
    }))
  } as JsonValue);
}

export function selectContext(request: ContextRequest, sources: readonly SourceRecord[]): SelectedContext[] {
  if (!Number.isInteger(request.maxItems) || request.maxItems < 0) {
    throw new TypeError("maxItems must be a non-negative integer.");
  }
  const connectorIds = new Set(request.connectorIds);
  const categories = new Set(request.categories);
  return sorted(sources.filter((source) => {
    if (!source.reviewed || !connectorIds.has(source.connectorId) || !categories.has(source.category)) return false;
    if (source.expiresAt <= request.now) throw new TypeError(`Source stale: ${source.id}.`);
    if (sha256Bytes(source.content) !== source.digest) throw new TypeError(`Source digest mismatch: ${source.id}.`);
    return true;
  }), (left, right) => `${left.connectorId}\u0000${left.category}\u0000${left.id}`.localeCompare(`${right.connectorId}\u0000${right.category}\u0000${right.id}`))
    .slice(0, request.maxItems)
    .map(({ id, connectorId, category, origin, digest, content }) => ({ sourceId: id, connectorId, category, origin, digest, content }));
}
