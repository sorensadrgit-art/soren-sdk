import { describe, expect, it } from "vitest";

import { routeCapabilities } from "../src/index.js";
import {
  MemoryCatalogFixture,
  manifestFixture,
  projectFixture,
  requestFixture,
  schemaRecordFixture
} from "./router-fixtures.js";

describe("deep Codex routing regressions", () => {
  it.each(["^18.0.0", ">=17 <19"])(
    "blocks Motion when the React range still admits unsupported releases: %s",
    (reactVersion) => {
      const project = projectFixture({ reactVersion });
      const plan = routeCapabilities({
        request: requestFixture({
          required: ["motion.layout"],
          projectSnapshotId: project.snapshotId
        }),
        project,
        catalog: new MemoryCatalogFixture()
      });

      expect(plan.status).toBe("blocked");
      expect(plan.constraints).toContainEqual(
        expect.objectContaining({ code: "ENVIRONMENT_UNSUPPORTED" })
      );
    }
  );

  it("accepts a React range whose minimum is 18.2", () => {
    const project = projectFixture({ reactVersion: "^18.2.0" });
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.layout"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.providerId).toBe("motion");
  });

  it("blocks shared ownership when either provider is exclusive", () => {
    const motion = manifestFixture("motion", ["motion.spring"]);
    const timing = motion.ownershipClaims.find(
      (claim) => claim.domain === "timing"
    );
    if (timing === undefined) throw new Error("Expected Motion timing ownership.");
    timing.exclusive = false;

    const gsap = manifestFixture("gsap", ["motion.timeline"]);
    const project = projectFixture();
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.spring", "motion.timeline"],
        quality: {
          "motion.spring": { scope: "hero", property: "transform" },
          "motion.timeline": { scope: "hero", property: "transform" }
        },
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture([
        schemaRecordFixture(motion),
        schemaRecordFixture(gsap)
      ])
    });

    expect(plan.status).toBe("blocked");
    expect(plan.constraints).toContainEqual(
      expect.objectContaining({ code: "OWNERSHIP_CONFLICT" })
    );
  });
});
