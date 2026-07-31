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
    gsapTimeline.properties = ["transform"];

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

  it("removes ownership-conflicting alternatives before tie resolution", () => {
    const webPlatform = manifestFixture("web-platform", [
      "platform.css-animation"
    ]);
    const webOwnership = webPlatform.ownershipClaims.find(
      (claim) => claim.domain === "dom-animation"
    );
    if (webOwnership === undefined) {
      throw new Error("Expected Web Platform animation ownership fixture.");
    }
    webOwnership.exclusive = false;
    webOwnership.properties = ["opacity"];

    const motion = manifestFixture("motion", ["motion.spring"]);
    const motionTiming = motion.ownershipClaims.find(
      (claim) => claim.domain === "timing"
    );
    if (motionTiming === undefined) {
      throw new Error("Expected Motion timing ownership fixture.");
    }
    motionTiming.exclusive = false;
    motionTiming.properties = ["opacity"];

    const gsap = manifestFixture("gsap", ["motion.spring"]);
    const gsapTiming = gsap.ownershipClaims.find(
      (claim) => claim.domain === "timing"
    );
    if (gsapTiming === undefined) {
      throw new Error("Expected GSAP timing ownership fixture.");
    }
    gsapTiming.exclusive = true;
    gsapTiming.properties = ["opacity"];

    const project = projectFixture();
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["platform.css-animation", "motion.spring"],
        quality: {
          "platform.css-animation": { scope: "hero", property: "opacity" },
          "motion.spring": { scope: "hero", property: "opacity" }
        },
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture([
        schemaRecordFixture(webPlatform),
        schemaRecordFixture(motion),
        schemaRecordFixture(gsap)
      ])
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders.map((provider) => provider.providerId)).toEqual([
      "motion"
    ]);
    expect(plan.requiredInput).toEqual([]);
  });
});
