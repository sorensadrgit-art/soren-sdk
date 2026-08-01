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

export type ProjectContentScope =
  | "source"
  | "configuration"
  | "dependencies"
  | "lockfile";

export interface ProjectContentRequest {
  projectSnapshot: Digest;
  policySnapshot: Digest;
  scopes: readonly ProjectContentScope[];
}

export interface ConsentSubject {
  readonly kind: "principal" | "run";
  readonly id: string;
}

/** Immutable record issued by the injected authorization authority. */
export interface ProjectContentConsent {
  readonly subject: ConsentSubject;
  readonly projectSnapshot: Digest;
  readonly providerId: string;
  readonly toolId: string;
  readonly allowedContentScope: readonly ProjectContentScope[];
  readonly policySnapshot: Digest;
  readonly expiresAt: string;
  readonly digest: Digest;
}

export interface ProjectContentConsentLookup {
  readonly subject: ConsentSubject;
  readonly projectSnapshot: Digest;
  readonly providerId: string;
  readonly toolId: string;
  readonly requestedContentScope: readonly ProjectContentScope[];
  readonly policySnapshot: Digest;
}

/**
 * The sole authority for remote project-content permission. Tool inventories
 * are untrusted metadata and cannot substitute for this provider.
 */
export interface ProjectContentConsentProvider {
  findConsent(lookup: ProjectContentConsentLookup): ProjectContentConsent | undefined;
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

function normalizedScopes(
  scopes: readonly ProjectContentScope[]
): ProjectContentScope[] {
  return sorted([...new Set(scopes)], (left, right) => left.localeCompare(right));
}

function consentDigest(value: Omit<ProjectContentConsent, "digest">): Digest {
  return digestJson(value as unknown as JsonValue);
}

export function createProjectContentConsent(
  input: Omit<ProjectContentConsent, "digest">
): ProjectContentConsent {
  const allowedContentScope = normalizedScopes(input.allowedContentScope);
  if (
    input.subject.id.length === 0 ||
    input.providerId.length === 0 ||
    input.toolId.length === 0 ||
    allowedContentScope.length === 0
  ) {
    throw new TypeError("Invalid project-content consent.");
  }
  const subject = Object.freeze({ ...input.subject });
  const normalized: Omit<ProjectContentConsent, "digest"> = {
    ...input,
    subject,
    allowedContentScope: Object.freeze(allowedContentScope)
  };
  return Object.freeze({
    ...normalized,
    digest: consentDigest(normalized)
  });
}

function consentMatches(
  consent: ProjectContentConsent,
  lookup: ProjectContentConsentLookup,
  now: string
): boolean {
  const { digest, ...base } = consent;
  return (
    digest === consentDigest(base) &&
    consent.expiresAt > now &&
    consent.subject.kind === lookup.subject.kind &&
    consent.subject.id === lookup.subject.id &&
    consent.projectSnapshot === lookup.projectSnapshot &&
    consent.providerId === lookup.providerId &&
    consent.toolId === lookup.toolId &&
    consent.policySnapshot === lookup.policySnapshot &&
    lookup.requestedContentScope.every((scope) =>
      consent.allowedContentScope.includes(scope)
    )
  );
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
    if (tool === undefined || !tool.readOnly) {
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
    private readonly auditTime: () => string,
    private readonly projectContentConsentProvider?: ProjectContentConsentProvider
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
    now: string,
    projectContent?: ProjectContentRequest
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
      !tool.readOnly
    ) {
      event("TOOL_DENIED");
      throw new TypeError("Tool denied.");
    }
    if (projectContent !== undefined) {
      const scopes = normalizedScopes(projectContent.scopes);
      const lookup: ProjectContentConsentLookup = {
        subject: { kind: "run", id: grant.runId },
        projectSnapshot: projectContent.projectSnapshot,
        providerId: grant.providerId,
        toolId,
        requestedContentScope: scopes,
        policySnapshot: projectContent.policySnapshot
      };
      const consent = this.projectContentConsentProvider?.findConsent(lookup);
      if (
        scopes.length === 0 ||
        consent === undefined ||
        !consentMatches(consent, lookup, now)
      ) {
        event("PROJECT_CONTENT_CONSENT_DENIED");
        throw new TypeError("Project-content consent denied.");
      }
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
