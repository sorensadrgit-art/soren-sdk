import { digestJson } from "@soren-sdk/contracts";
import type { Digest, JsonValue } from "@soren-sdk/contracts";
import type { ResolvePolicyInput, ResolvedPolicy } from "./policy.js";

export class ResolvedPolicyMissingError extends Error {
  readonly code: "POLICY_SNAPSHOT_MISSING";

  constructor(message: string) {
    super(message);
    this.name = "ResolvedPolicyMissingError";
    this.code = "POLICY_SNAPSHOT_MISSING";
  }
}

function jsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

/**
 * Deterministic fingerprint of a resolve request: a digest of the project root
 * plus the identity of any organization/run policy layers. Used to key
 * precomputed resolved-policy snapshots so parallel phases can consume this
 * port without filesystem or layer-loading side effects.
 */
export function policyFingerprint(input: ResolvePolicyInput): Digest {
  return digestJson(
    jsonValue({
      projectRoot: input.projectRoot,
      organizationPolicy: input.organizationPolicy?.policyId ?? null,
      runPolicy: input.runPolicy?.policyId ?? null,
    })
  );
}

/**
 * Integration port for resolved-policy snapshots. Phases 6–9 (REST/MCP/
 * TypeScript SDK surfaces) consume this interface instead of importing the
 * filesystem-backed `PolicyResolver` directly.
 */
export interface ResolvedPolicyProvider {
  getResolvedPolicy(input: ResolvePolicyInput): ResolvedPolicy;
}

/**
 * In-memory `ResolvedPolicyProvider` backed by a preloaded map keyed by
 * `policyFingerprint`. Throws `POLICY_SNAPSHOT_MISSING` for unknown inputs.
 */
export class MemoryResolvedPolicyProvider implements ResolvedPolicyProvider {
  readonly #policies: ReadonlyMap<Digest, ResolvedPolicy>;

  constructor(policies: ReadonlyMap<Digest, ResolvedPolicy>) {
    this.#policies = policies;
  }

  getResolvedPolicy(input: ResolvePolicyInput): ResolvedPolicy {
    const fingerprint = policyFingerprint(input);
    const policy = this.#policies.get(fingerprint);
    if (policy === undefined) {
      throw new ResolvedPolicyMissingError(
        `no resolved policy snapshot for fingerprint ${fingerprint}`
      );
    }
    return policy;
  }
}
