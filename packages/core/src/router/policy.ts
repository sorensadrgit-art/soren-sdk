import {
  digestJson,
  validateContract,
  type JsonValue,
  type PolicyDocument
} from "@soren-sdk/contracts";

import {
  RouteInputError,
  type ActiveRoutingPolicy
} from "./types.js";

export { RouteInputError } from "./types.js";

const PHASE4_POLICY: PolicyDocument = {
  schemaVersion: "1.0.0-draft.1",
  contractKind: "policy",
  policyId: "phase-4-read-only",
  version: "1.0.0",
  scope: "builtin",
  rules: {
    allowedConnectors: ["gsap", "motion", "web-platform"],
    deniedConnectors: [],
    allowExperimental: false,
    allowedLicenses: [
      "LicenseRef-GSAP-Standard",
      "MIT",
      "not-applicable"
    ],
    allowPaidServices: false,
    network: { mode: "deny", allowedHosts: [] },
    filesystem: { read: ["project"], write: [] },
    allowRemoteProjectContent: false,
    requireReducedMotion: true,
    requiredApprovals: []
  }
};

function jsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function subset(values: readonly string[], allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return values.every((value) => allowedSet.has(value));
}

function assertValidPolicy(value: unknown): PolicyDocument {
  const result = validateContract<PolicyDocument>("policy", value);
  if (!result.ok) {
    throw new RouteInputError(
      "POLICY_INVALID",
      result.issues
        .map(
          (issue) =>
            `${issue.instancePath || "/"} ${issue.keyword}: ${issue.message}`
        )
        .join("; ")
    );
  }
  return result.value;
}

function assertTightening(policy: PolicyDocument): void {
  const base = PHASE4_POLICY.rules;
  const rules = policy.rules;
  const weakening: string[] = [];

  if (!subset(rules.allowedConnectors, base.allowedConnectors)) {
    weakening.push("allowedConnectors");
  }
  if (!subset(rules.allowedLicenses, base.allowedLicenses)) {
    weakening.push("allowedLicenses");
  }
  if (rules.allowExperimental) weakening.push("allowExperimental");
  if (rules.allowPaidServices) weakening.push("allowPaidServices");
  if (rules.network.mode !== "deny" || rules.network.allowedHosts.length > 0) {
    weakening.push("network");
  }
  if (!subset(rules.filesystem.read, base.filesystem.read)) {
    weakening.push("filesystem.read");
  }
  if (rules.filesystem.write.length > 0) weakening.push("filesystem.write");
  if (rules.allowRemoteProjectContent) {
    weakening.push("allowRemoteProjectContent");
  }
  if (!rules.requireReducedMotion) weakening.push("requireReducedMotion");

  if (weakening.length > 0) {
    throw new RouteInputError(
      "POLICY_WEAKENING_DENIED",
      `Override weakens Phase 4 policy fields: ${weakening.sort().join(", ")}.`,
      { fields: weakening.sort() }
    );
  }
}

function normalizedPolicy(policy: PolicyDocument): PolicyDocument {
  return {
    ...structuredClone(policy),
    rules: {
      ...structuredClone(policy.rules),
      allowedConnectors: stableUnique(policy.rules.allowedConnectors),
      deniedConnectors: stableUnique(policy.rules.deniedConnectors),
      allowedLicenses: stableUnique(policy.rules.allowedLicenses),
      network: {
        mode: policy.rules.network.mode,
        allowedHosts: stableUnique(policy.rules.network.allowedHosts)
      },
      filesystem: {
        read: stableUnique(policy.rules.filesystem.read),
        write: stableUnique(policy.rules.filesystem.write)
      },
      requiredApprovals: [...new Set(policy.rules.requiredApprovals)].sort()
    }
  };
}

export function getPhase4Policy(
  override?: PolicyDocument
): ActiveRoutingPolicy {
  const source = override === undefined ? PHASE4_POLICY : assertValidPolicy(override);
  if (override !== undefined) assertTightening(source);
  const document = assertValidPolicy(normalizedPolicy(source));
  return {
    document: structuredClone(document),
    snapshotId: digestJson(jsonValue(document))
  };
}
