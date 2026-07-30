import { describe, expect, it } from "vitest";

import { routeCapabilities } from "../src/index.js";
import {
  MemoryCatalogFixture,
  manifestFixture,
  projectFixture,
  requestFixture,
  schemaRecordFixture
} from "./router-fixtures.js";

describe("Phase 4 ownership claim properties", () => {
  it("does not invent exclusivity for an undeclared property", () => {
    const motion = manifestFixture("motion", ["motion.layout"]);
    const motionLayout = motion.ownershipClaims.find(
      (claim) => claim.domain === "layout"
    );
    if (motionLayout === undefined) {
      throw new Error("Expected Motion layout ownership fixture.");
    }
    motionLayout.properties = ["layout", "transform"];

    const gsap = manifestFixture("gsap", ["motion.timeline"]);
    const gsapTimeline = gsap.ownershipClaims.find(
      (claim) => claim.domain === "timeline"
    );
    if (gsapTimeline === undefined) {
      throw new Error("Expected GSAP timeline ownership fixture.");
    }
    gsapTimeline.properties = ["opacity", "transform"];

    const project = projectFixture();
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.layout", "motion.timeline"],
        quality: {
          "motion.layout": { scope: "hero", property: "opacity" },
          "motion.timeline": { scope: "hero", property: "opacity" }
        },
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture([
        schemaRecordFixture(motion),
        schemaRecordFixture(gsap)
      ])
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders.map((provider) => provider.providerId).sort()).toEqual([
      "gsap",
      "motion"
    ]);
    expect(plan.ownership).toContainEqual({
      providerId: "motion",
      domain: "layout",
      scope: "hero",
      properties: ["opacity"]
    });
  });
});
