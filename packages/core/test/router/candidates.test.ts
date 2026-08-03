import { describe, expect, it } from "vitest";

import type { CatalogReader } from "../../src/catalog/types.js";
import {
  buildProviderCandidates,
  isAtLeast,
  minimumDeclaredVersion
} from "../../src/router/candidates.js";
import { getPhase4Policy } from "../../src/router/policy.js";
import {
  projectFixture,
  requestFixture,
  routingCatalog
} from "./fixtures.js";

describe("router version constraints", () => {
  for (const [value, expected] of [
    ["19.2.0", [19, 2, 0]],
    ["19", [19, 0, 0]],
    ["19.2", [19, 2, 0]],
    ["^19.0.0", [19, 0, 0]],
    ["~18.2.1", [18, 2, 1]],
    [">=18.2", [18, 2, 0]],
    ["workspace:^19.0.0", [19, 0, 0]],
    ["npm:react@19.2.0", [19, 2, 0]]
  ] as const) {
    it(`parses ${value}`, () => {
      expect(minimumDeclaredVersion(value)).toEqual(expected);
    });
  }

  for (const value of ["latest", "*", "18 || 19", "<20", "workspace:*"]) {
    it(`rejects ambiguous range ${value}`, () => {
      expect(minimumDeclaredVersion(value)).toBeNull();
    });
  }

  it("compares a declared minimum conservatively", () => {
    expect(isAtLeast("18.2.0", [18, 2, 0])).toBe(true);
    expect(isAtLeast("^19", [18, 2, 0])).toBe(true);
    expect(isAtLeast("18.1.9", [18, 2, 0])).toBe(false);
    expect(isAtLeast("latest", [18, 2, 0])).toBeNull();
  });
});

describe("provider candidate construction", () => {
  it("builds healthy providers in stable order", () => {
    const result = buildProviderCandidates({
      request: requestFixture(),
      project: projectFixture({ react: "19.2.0" }),
      catalog: routingCatalog(),
      policy: getPhase4Policy()
    });

    expect(result.candidates.map((candidate) => candidate.providerId)).toEqual([
      "gsap",
      "motion",
      "web-platform"
    ]);
  });

  it("records installed runtime packages and a legacy Motion alias", () => {
    const result = buildProviderCandidates({
      request: requestFixture(),
      project: projectFixture({
        react: "19.2.0",
        dependencies: ["motion", "gsap", "framer-motion"]
      }),
      catalog: routingCatalog(),
      policy: getPhase4Policy()
    });

    expect(result.candidates.find((item) => item.providerId === "motion")).toMatchObject({
      installed: true,
      legacyAliasPresent: true,
      runtimeIntegrationIds: ["motion-runtime"]
    });
    expect(result.candidates.find((item) => item.providerId === "gsap")).toMatchObject({
      installed: true,
      legacyAliasPresent: false,
      runtimeIntegrationIds: ["gsap-runtime"]
    });
  });

  it("does not treat framer-motion as the Motion runtime package", () => {
    const result = buildProviderCandidates({
      request: requestFixture(),
      project: projectFixture({
        react: "19.2.0",
        dependencies: ["framer-motion"]
      }),
      catalog: routingCatalog(),
      policy: getPhase4Policy()
    });

    expect(result.candidates.find((item) => item.providerId === "motion")).toMatchObject({
      installed: false,
      legacyAliasPresent: true
    });
  });

  for (const [react, supported] of [
    ["18.2.0", true],
    ["^19.0.0", true],
    [">=18.2", true],
    ["18.1.0", false],
    ["^17", false],
    ["workspace:*", false]
  ] as const) {
    it(`marks Motion React claims supported=${supported} for ${react}`, () => {
      const result = buildProviderCandidates({
        request: requestFixture(),
        project: projectFixture({ react }),
        catalog: routingCatalog(),
        policy: getPhase4Policy()
      });
      const motion = result.candidates.find((item) => item.providerId === "motion");
      expect(
        motion?.claims.find((claim) => claim.capabilityId === "motion.presence")
      ).toMatchObject({ environmentSupported: supported });
    });
  }

  it("keeps GSAP claims framework agnostic", () => {
    const result = buildProviderCandidates({
      request: requestFixture({ capability: "motion.timeline" }),
      project: projectFixture(),
      catalog: routingCatalog(),
      policy: getPhase4Policy()
    });
    const gsap = result.candidates.find((item) => item.providerId === "gsap");
    expect(gsap?.claims.every((claim) => claim.environmentSupported)).toBe(true);
  });

  it("excludes a provider denied by the active policy", () => {
    const override = structuredClone(getPhase4Policy().document);
    override.policyId = "no-motion";
    override.scope = "project";
    override.rules.allowedConnectors = ["gsap", "web-platform"];
    override.rules.deniedConnectors = ["motion"];

    const result = buildProviderCandidates({
      request: requestFixture(),
      project: projectFixture({ react: "19.2.0" }),
      catalog: routingCatalog(),
      policy: getPhase4Policy(override)
    });

    expect(result.candidates.some((item) => item.providerId === "motion")).toBe(false);
    expect(result.rejections).toContainEqual(
      expect.objectContaining({
        providerId: "motion",
        reasonCode: "POLICY_DENIED"
      })
    );
  });

  it("excludes a connector whose health changes to blocked", () => {
    const base = routingCatalog();
    const catalog: CatalogReader = {
      getCapabilityCatalog: () => base.getCapabilityCatalog(),
      list: () => base.list(),
      get: (id) => base.get(id),
      snapshot: (createdAt) => base.snapshot(createdAt),
      health: (id) =>
        id === "motion"
          ? {
              connectorId: "motion",
              state: "blocked",
              selectable: false,
              reviewStatus: "approved",
              blockers: ["fixture blocker"],
              warnings: [],
              errors: []
            }
          : base.health(id)
    };

    const result = buildProviderCandidates({
      request: requestFixture(),
      project: projectFixture({ react: "19.2.0" }),
      catalog,
      policy: getPhase4Policy()
    });

    expect(result.candidates.some((item) => item.providerId === "motion")).toBe(false);
    expect(result.rejections).toContainEqual(
      expect.objectContaining({
        providerId: "motion",
        reasonCode: "CONNECTOR_UNHEALTHY"
      })
    );
  });
});
