import { describe, expect, it } from "vitest";

import { routeCapabilities } from "../src/index.js";
import {
  MemoryCatalogFixture,
  manifestFixture,
  projectFixture,
  requestFixture,
  schemaRecordFixture
} from "./router-fixtures.js";

describe("latest Codex review-wave regressions", () => {
  it("rejects explicit properties outside every provider ownership claim", () => {
    const webPlatform = manifestFixture("web-platform", [
      "platform.css-animation"
    ]);
    const webOwnership = webPlatform.ownershipClaims.find(
      (claim) => claim.domain === "dom-animation"
    );
    if (webOwnership === undefined) throw new Error("Expected web ownership.");
    webOwnership.properties = ["opacity"];

    const gsap = manifestFixture("gsap", ["motion.timeline"]);
    const gsapOwnership = gsap.ownershipClaims.find(
      (claim) => claim.domain === "timeline"
    );
    if (gsapOwnership === undefined) throw new Error("Expected GSAP ownership.");
    gsapOwnership.properties = ["transform"];

    const project = projectFixture();
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["platform.css-animation", "motion.timeline"],
        quality: {
          "platform.css-animation": { scope: "hero", property: "width" },
          "motion.timeline": { scope: "hero", property: "width" }
        },
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture([
        schemaRecordFixture(webPlatform),
        schemaRecordFixture(gsap)
      ])
    });

    expect(plan.status).toBe("blocked");
    expect(plan.selectedProviders).toEqual([]);
  });

  it("prefers a workspace-local incompatible dependency over root reuse", () => {
    const project = projectFixture();
    project.workspace = {
      isMonorepo: true,
      packages: [{ name: "app", path: "packages/app", private: true }]
    };
    project.dependencies.push(
      {
        name: "gsap",
        version: "3.15.0",
        kind: "dependency",
        workspace: "."
      },
      {
        name: "gsap",
        version: "2.0.0",
        kind: "dependency",
        workspace: "packages/app"
      }
    );
    const request = requestFixture({
      required: ["motion.timeline"],
      projectSnapshotId: project.snapshotId
    });
    const capability = request.capabilities[0];
    if (capability === undefined) throw new Error("Expected timeline capability.");
    capability.quality = { workspace: "packages/app" };

    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.reasonCode).toBe("CAPABILITY_MATCH");
  });

  it("expands partial greater-than comparators before dependency reuse", () => {
    const project = projectFixture({ dependencies: ["motion"] });
    const dependency = project.dependencies.find(
      (item) => item.name === "motion"
    );
    if (dependency === undefined) throw new Error("Expected Motion dependency.");
    dependency.version = ">12.42";

    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.layout"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.reasonCode).toBe("CAPABILITY_MATCH");
  });
});
