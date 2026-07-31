import { describe, expect, it } from "vitest";

import { routeCapabilities } from "../src/index.js";
import {
  MemoryCatalogFixture,
  manifestFixture,
  projectFixture,
  requestFixture,
  schemaRecordFixture
} from "./router-fixtures.js";

describe("Phase 4 ownership constraints before scoring", () => {
  it("chooses a lower-scored valid route over a reused conflicting route", () => {
    const webPlatform = manifestFixture("web-platform", [
      "platform.css-animation"
    ]);
    const webOwnership = webPlatform.ownershipClaims.find(
      (claim) => claim.domain === "dom-animation"
    );
    if (webOwnership === undefined) {
      throw new Error("Expected Web Platform ownership fixture.");
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
    motionTiming.exclusive = true;
    motionTiming.properties = ["opacity"];

    const gsap = manifestFixture("gsap", ["motion.spring"]);
    const gsapTiming = gsap.ownershipClaims.find(
      (claim) => claim.domain === "timing"
    );
    if (gsapTiming === undefined) {
      throw new Error("Expected GSAP timing ownership fixture.");
    }
    gsapTiming.exclusive = false;
    gsapTiming.properties = ["opacity"];

    const project = projectFixture({ dependencies: ["motion"] });
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
      "gsap"
    ]);
    expect(plan.constraints).toContainEqual(
      expect.objectContaining({
        code: "OWNERSHIP_CONFLICT",
        status: "passed"
      })
    );
  });
});
