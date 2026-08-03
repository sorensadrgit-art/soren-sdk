import { describe, expect, it } from "vitest";

import type { PolicyDocument } from "@soren-sdk/contracts";

import {
  RouteInputError,
  getPhase4Policy
} from "../../src/router/policy.js";

function clonePolicy(): PolicyDocument {
  return structuredClone(getPhase4Policy().document);
}

describe("Phase 4 routing policy", () => {
  it("creates a stable immutable read-only policy", () => {
    const first = getPhase4Policy();
    const second = getPhase4Policy();

    expect(first).toEqual(second);
    expect(first.snapshotId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.document).toMatchObject({
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
    });
  });

  it("allows tightening connector and license rules", () => {
    const override = clonePolicy();
    override.policyId = "motion-only";
    override.scope = "project";
    override.rules.allowedConnectors = ["motion", "web-platform"];
    override.rules.deniedConnectors = ["gsap"];
    override.rules.allowedLicenses = ["MIT", "not-applicable"];

    const result = getPhase4Policy(override);

    expect(result.document.rules.allowedConnectors).toEqual([
      "motion",
      "web-platform"
    ]);
    expect(result.document.rules.deniedConnectors).toEqual(["gsap"]);
    expect(result.document.rules.allowedLicenses).toEqual([
      "MIT",
      "not-applicable"
    ]);
    expect(result.snapshotId).not.toBe(getPhase4Policy().snapshotId);
  });

  for (const [name, mutate] of [
    [
      "experimental connectors",
      (policy: PolicyDocument) => {
        policy.rules.allowExperimental = true;
      }
    ],
    [
      "paid services",
      (policy: PolicyDocument) => {
        policy.rules.allowPaidServices = true;
      }
    ],
    [
      "network access",
      (policy: PolicyDocument) => {
        policy.rules.network = { mode: "unrestricted", allowedHosts: [] };
      }
    ],
    [
      "project writes",
      (policy: PolicyDocument) => {
        policy.rules.filesystem.write = ["project"];
      }
    ],
    [
      "remote project content",
      (policy: PolicyDocument) => {
        policy.rules.allowRemoteProjectContent = true;
      }
    ],
    [
      "weaker reduced-motion requirements",
      (policy: PolicyDocument) => {
        policy.rules.requireReducedMotion = false;
      }
    ],
    [
      "additional connectors",
      (policy: PolicyDocument) => {
        policy.rules.allowedConnectors.push("lenis");
      }
    ],
    [
      "additional licenses",
      (policy: PolicyDocument) => {
        policy.rules.allowedLicenses.push("GPL-3.0-only");
      }
    ]
  ] as const) {
    it(`rejects an override that weakens ${name}`, () => {
      const override = clonePolicy();
      override.policyId = "weakened";
      override.scope = "project";
      mutate(override);

      expect(() => getPhase4Policy(override)).toThrow(RouteInputError);
      expect(() => getPhase4Policy(override)).toThrow(
        "POLICY_WEAKENING_DENIED"
      );
    });
  }
});
