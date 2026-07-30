import { type RoutePlan } from "@soren-sdk/contracts";
import { describe, expect, it } from "vitest";

import { routeCapabilities } from "../src/index.js";
import {
  MemoryCatalogFixture,
  manifestFixture,
  projectFixture,
  requestFixture,
  schemaRecordFixture
} from "./router-fixtures.js";

function providerIds(plan: RoutePlan): string[] {
  return plan.selectedProviders.map((provider) => provider.providerId).sort();
}

describe("Phase 4 companion runtime artifacts", () => {
  it("blocks a capability when its required companion runtime is unavailable", () => {
    const gsapWithoutScrollTrigger = manifestFixture("gsap", [
      "scroll.triggered-animation"
    ]);
    const project = projectFixture();
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["scroll.triggered-animation"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture([
        schemaRecordFixture(gsapWithoutScrollTrigger)
      ])
    });

    expect(plan.status).toBe("blocked");
    expect(plan.constraints).toContainEqual(
      expect.objectContaining({
        code: "CAPABILITY_NOT_SUPPORTED",
        status: "failed"
      })
    );
  });
});

describe("Phase 4 deterministic tie resolution", () => {
  it("uses stable provider ID only for behaviorally equivalent routes", () => {
    const motion = manifestFixture("motion", ["motion.spring"]);
    const equivalentGsap = structuredClone(motion);
    equivalentGsap.connector.id = "gsap";
    equivalentGsap.connector.name = "Equivalent GSAP fixture";
    equivalentGsap.product.canonicalName = "Equivalent GSAP fixture";
    const project = projectFixture();
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.spring"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture([
        schemaRecordFixture(equivalentGsap),
        schemaRecordFixture(motion)
      ])
    });

    expect(plan.status).toBe("selected");
    expect(providerIds(plan)).toEqual(["gsap"]);
  });
});
