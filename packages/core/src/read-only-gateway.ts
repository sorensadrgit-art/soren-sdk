import { canonicalJson, digestJson, type Digest, type JsonValue } from "@soren-sdk/contracts";

import { inventoryDigest, type ToolInventory } from "./context-gateway.js";
import { validateInventory } from "./protocol-negotiation.js";
import type { RunGrant, RunGrantStore } from "./run-grants.js";
import { validateJsonSchema } from "./schema-validation.js";

type GatewayAbortReason = "caller-cancelled" | "timed-out" | "kill-switch";
class GatewayAbortError extends Error {
  constructor(readonly reason: GatewayAbortReason) { super(reason); this.name = "GatewayAbortError"; }
}
function auditCodeForAbort(reason: GatewayAbortReason): "CALL_CANCELLED" | "CALL_TIMED_OUT" | "KILL_SWITCH" {
  return reason === "caller-cancelled" ? "CALL_CANCELLED" : reason === "timed-out" ? "CALL_TIMED_OUT" : "KILL_SWITCH";
}

class GatewayAuthorizationChangedError extends Error {
  constructor() { super("authorization-changed"); this.name = "GatewayAuthorizationChangedError"; }
}

export interface ProjectContentConsent {
  readonly runId: string;
  readonly providerId: string;
  readonly toolId: string;
  readonly projectSnapshot: string;
  readonly policySnapshot: string;
  readonly scopes: readonly string[];
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly digest: Digest;
}

export interface ProjectContentConsentQuery {
  readonly runId: string;
  readonly providerId: string;
  readonly toolId: string;
  readonly projectSnapshot: string;
  readonly policySnapshot: string;
  readonly requiredScopes: readonly string[];
}

function requireNonEmptyText(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`Invalid ${field}.`);
}
function parseTimestamp(value: string, field: string): number {
  requireNonEmptyText(value, field); const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(`Invalid ${field}.`);
  return timestamp;
}
function normalizeScopes(scopes: readonly string[]): readonly string[] {
  if (!Array.isArray(scopes)) throw new TypeError("Invalid scopes.");
  const normalized = scopes.map((scope) => { requireNonEmptyText(scope, "scope"); return scope; });
  const result = [...new Set(normalized)].sort();
  if (result.length === 0) throw new TypeError("Invalid scopes.");
  return Object.freeze(result);
}
function validateConsent(consent: ProjectContentConsent): { readonly issuedAt: number; readonly expiresAt: number; readonly scopes: readonly string[] } {
  requireNonEmptyText(consent.runId, "runId"); requireNonEmptyText(consent.providerId, "providerId"); requireNonEmptyText(consent.toolId, "toolId"); requireNonEmptyText(consent.projectSnapshot, "projectSnapshot"); requireNonEmptyText(consent.policySnapshot, "policySnapshot");
  const issuedAt = parseTimestamp(consent.issuedAt, "issuedAt"); const expiresAt = parseTimestamp(consent.expiresAt, "expiresAt");
  if (expiresAt <= issuedAt) throw new TypeError("Invalid consent window.");
  const scopes = normalizeScopes(consent.scopes);
  if (consent.digest !== projectContentConsentDigest({ runId: consent.runId, providerId: consent.providerId, toolId: consent.toolId, projectSnapshot: consent.projectSnapshot, policySnapshot: consent.policySnapshot, scopes, issuedAt: consent.issuedAt, expiresAt: consent.expiresAt })) throw new TypeError("Invalid consent digest.");
  return { issuedAt, expiresAt, scopes };
}

export function projectContentConsentDigest(consent: Omit<ProjectContentConsent, "digest">): Digest {
  const { runId, providerId, toolId, projectSnapshot, policySnapshot, scopes, issuedAt, expiresAt } = consent;
  return digestJson({ runId, providerId, toolId, projectSnapshot, policySnapshot, scopes: [...normalizeScopes(scopes)], issuedAt, expiresAt });
}

export interface ConsentStore {
  authorize(query: ProjectContentConsentQuery, now: string): boolean;
}

export class InMemoryConsentStore implements ConsentStore {
  readonly #consents: readonly ProjectContentConsent[];
  constructor(consents: readonly ProjectContentConsent[] = []) { this.#consents = consents.map((consent) => Object.freeze({ ...consent, scopes: Object.freeze([...consent.scopes]) })); }
  authorize(query: ProjectContentConsentQuery, now: string): boolean {
    try {
      const current = parseTimestamp(now, "now");
      const requiredScopes = normalizeScopes(query.requiredScopes);
      requireNonEmptyText(query.runId, "runId"); requireNonEmptyText(query.providerId, "providerId"); requireNonEmptyText(query.toolId, "toolId"); requireNonEmptyText(query.projectSnapshot, "projectSnapshot"); requireNonEmptyText(query.policySnapshot, "policySnapshot");
      return this.#consents.some((item) => {
        try {
          const validated = validateConsent(item);
          return item.runId === query.runId && item.providerId === query.providerId && item.toolId === query.toolId && item.projectSnapshot === query.projectSnapshot && item.policySnapshot === query.policySnapshot && current >= validated.issuedAt && current < validated.expiresAt && requiredScopes.every((scope) => validated.scopes.includes(scope));
        } catch { return false; }
      });
    } catch { return false; }
  }
}

export interface ReadOnlyToolProvider {
  inventory(): ToolInventory;
  call(toolId: string, input: JsonValue, options: { signal: AbortSignal }): Promise<JsonValue> | JsonValue;
}

class GatewayProviderError extends Error {
  constructor(readonly providerError: unknown) { super("provider-failed"); this.name = "GatewayProviderError"; }
}
type ProviderOutcome = { readonly ok: true; readonly output: JsonValue } | { readonly ok: false; readonly error: unknown };

export interface GatewayCallOptions {
  readonly projectSnapshot: string;
  readonly policySnapshot: string;
  readonly signal?: AbortSignal;
  readonly deadline?: string;
}

function schema(value: JsonValue | undefined): object | boolean {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("Invalid tool schema.");
  return value;
}

interface ActiveGatewayCall {
  readonly controller: AbortController;
  readonly aborted: Promise<never>;
  abort(reason: GatewayAbortReason): void;
}

export class ReadOnlyToolGateway {
  #killed = false;
  readonly #activeCalls = new Set<ActiveGatewayCall>();
  readonly #events: { readonly code: string; readonly digest: string }[] = [];

  constructor(private readonly provider: ReadOnlyToolProvider, private readonly grants: RunGrantStore, private readonly consents: ConsentStore, private readonly clock: () => string) {}

  kill(): void { this.#killed = true; for (const activeCall of this.#activeCalls) activeCall.abort("kill-switch"); }
  auditEvents(): readonly { readonly code: string; readonly digest: string }[] { return this.#events.map((event) => ({ ...event })); }

  async call(grant: RunGrant, toolId: string, input: JsonValue, options: GatewayCallOptions): Promise<JsonValue> {
    const event = (code: string) => this.#events.push(Object.freeze({ code, digest: digestJson({ code, at: this.clock() }) }));
    const startedAt = this.clock();
    if (this.#killed) { event(auditCodeForAbort("kill-switch")); throw new GatewayAbortError("kill-switch"); }
    if (options.signal?.aborted) { event(auditCodeForAbort("caller-cancelled")); throw new GatewayAbortError("caller-cancelled"); }
    if (options.deadline !== undefined) {
      const deadline = Date.parse(options.deadline);
      if (!Number.isFinite(deadline)) { event("DEADLINE_INVALID"); throw new TypeError("Invalid gateway deadline."); }
      if (deadline <= Date.parse(startedAt)) { event(auditCodeForAbort("timed-out")); throw new GatewayAbortError("timed-out"); }
    }
    const record = this.grants.authorize(grant, startedAt);
    if (record === undefined) { event("GRANT_DENIED"); throw new TypeError("Run grant denied."); }
    const inventory = this.provider.inventory();
    try { validateInventory(inventory); } catch (error) { event("INVENTORY_INVALID"); throw error; }
    if (record.providerId !== inventory.providerId || record.inventoryDigest !== inventoryDigest(inventory)) { event("INVENTORY_CHANGED"); throw new TypeError("Run grant denied."); }
    const tool = inventory.tools.find((candidate) => candidate.id === toolId);
    if (tool === undefined || !tool.readOnly || !record.toolIds.includes(toolId)) { event("TOOL_DENIED"); throw new TypeError("Run grant denied."); }
    if (tool.exposesProjectContent) {
      const query: ProjectContentConsentQuery = { runId: record.runId, providerId: record.providerId, toolId, projectSnapshot: options.projectSnapshot, policySnapshot: options.policySnapshot, requiredScopes: ["read"] };
      if (!this.consents.authorize(query, startedAt)) { event("CONSENT_DENIED"); throw new TypeError("Run grant denied."); }
    }
    if (!validateJsonSchema(schema(tool.inputSchema), input).ok) { event("INPUT_SCHEMA_FAILED"); throw new TypeError("Input schema failed."); }
    const reservation = this.grants.reserveCall(grant, startedAt);
    const controller = new AbortController();
    let abortReason: GatewayAbortReason | undefined;
    let rejectAbort!: (error: GatewayAbortError) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    void aborted.catch(() => undefined);
    const activeCall: ActiveGatewayCall = {
      controller, aborted,
      abort: (reason) => { if (abortReason === undefined) { abortReason = reason; controller.abort(); rejectAbort(new GatewayAbortError(reason)); } }
    };
    this.#activeCalls.add(activeCall);
    const callerAbort = () => activeCall.abort("caller-cancelled"); options.signal?.addEventListener("abort", callerAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (options.deadline !== undefined) { const milliseconds = Date.parse(options.deadline) - Date.parse(startedAt); if (milliseconds <= 0) activeCall.abort("timed-out"); else timer = setTimeout(() => activeCall.abort("timed-out"), milliseconds); }
    let settled = false;
    try {
      const providerOutcome: Promise<ProviderOutcome> = Promise.resolve().then(() => this.provider.call(toolId, input, { signal: controller.signal })).then((output): ProviderOutcome => ({ ok: true, output })).catch((error): ProviderOutcome => ({ ok: false, error }));
      void providerOutcome.catch(() => undefined);
      const outcome = await Promise.race([providerOutcome, activeCall.aborted]);
      if (!outcome.ok) throw new GatewayProviderError(outcome.error);
      const output = outcome.output;
      const completedAt = this.clock();
      if (controller.signal.aborted || this.#killed) throw new GatewayAbortError(abortReason ?? "kill-switch");
      if (this.grants.authorize(grant, completedAt) === undefined) throw new GatewayAuthorizationChangedError();
      if (!validateJsonSchema(schema(tool.outputSchema), output).ok) { event("OUTPUT_SCHEMA_FAILED"); throw new TypeError("Output schema failed."); }
      const bytes = new TextEncoder().encode(canonicalJson(output)).byteLength;
      this.grants.commitCall(grant, reservation, bytes, completedAt);
      settled = true;
      event("TOOL_CALLED"); return output;
    } catch (error) {
      if (!settled) this.grants.releaseCall(grant, reservation, this.clock());
      if (error instanceof GatewayAbortError) { event(auditCodeForAbort(error.reason)); throw error; }
      if (error instanceof GatewayAuthorizationChangedError) { event("AUTHORIZATION_CHANGED"); throw error; }
      if (error instanceof GatewayProviderError) { event("PROVIDER_FAILED"); throw error.providerError; }
      if (error instanceof TypeError) throw error;
      event("PROVIDER_FAILED"); throw error;
    } finally { if (timer !== undefined) clearTimeout(timer); options.signal?.removeEventListener("abort", callerAbort); this.#activeCalls.delete(activeCall); }
  }
}
