import {
  assertContract,
  digestJson,
  type Digest,
  type JsonValue,
  type PolicyDocument
} from "@soren-sdk/contracts";

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export const PHASE_4_POLICY: PolicyDocument = {
  schemaVersion: "1.0.0-draft.1",
  contractKind: "policy",
  policyId: "phase-4-native-router",
  version: "1.0.0",
  scope: "builtin",
  rules: {
    allowedConnectors: ["gsap", "motion", "web-platform"],
    deniedConnectors: [],
    allowExperimental: false,
    allowedLicenses: ["LicenseRef-GSAP-Standard", "MIT", "not-applicable"],
    allowPaidServices: false,
    network: {
      mode: "deny",
      allowedHosts: []
    },
    filesystem: {
      read: [],
      write: []
    },
    allowRemoteProjectContent: false,
    maxBundleKilobytes: null,
    requireReducedMotion: true,
    requiredApprovals: [
      "command-execution",
      "network",
      "project-write",
      "remote-project-content"
    ]
  }
};

assertContract<PolicyDocument>("policy", PHASE_4_POLICY);

export function getPolicySnapshotId(
  policy: PolicyDocument = PHASE_4_POLICY
): Digest {
  assertContract<PolicyDocument>("policy", policy);
  return digestJson(json(policy));
}
