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

  it.each(["^18.2.0-rc.0", "~18.2.0-beta.1", ">=18.2.0-beta.1"])(
    "blocks Motion when the React range admits prereleases below stable 18.2: %s",
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

  it.each(["^18.2.0", "18.2.x", "19.x"])(
    "accepts a React range whose wildcard interval guarantees 18.2+: %s",
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

      expect(plan.status).toBe("selected");
      expect(plan.selectedProviders[0]?.providerId).toBe("motion");
    }
  );

  it("rejects incompatible React declarations inside the explicitly selected workspace", () => {
    const project = projectFixture();
    project.workspace = {
      isMonorepo: true,
      packages: [{ name: "app", path: "apps/app", private: true }]
    };
    project.dependencies = [
      ...project.dependencies.filter((dependency) => dependency.name !== "react"),
      {
        name: "react",
        version: "19.0.0",
        kind: "dependency",
        workspace: "apps/app"
      },
      {
        name: "react",
        version: "17.0.2",
        kind: "peerDependency",
        workspace: "apps/app"
      }
    ];
    project.frameworks = [
      { name: "react", version: "19.0.0", workspace: "apps/app" },
      { name: "react", version: "17.0.2", workspace: "apps/app" }
    ];
    const request = requestFixture({
      required: ["motion.layout"],
      projectSnapshotId: project.snapshotId
    });
    const capability = request.capabilities[0];
    if (capability === undefined) throw new Error("Expected Motion capability.");
    capability.quality = { workspace: "apps/app" };

    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("blocked");
    expect(plan.constraints).toContainEqual(
      expect.objectContaining({ code: "ENVIRONMENT_UNSUPPORTED" })
    );
  });

  it("treats missing browser targets as unresolved for required WAAPI", () => {
    const project = projectFixture();
    project.targets.browsers = [];
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["platform.waapi-animation"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("blocked");
    expect(plan.constraints).toContainEqual(
      expect.objectContaining({ code: "ENVIRONMENT_UNSUPPORTED" })
    );
  });

  it("honors a strict browser lower bound above the last unsupported release", () => {
    const project = projectFixture();
    project.targets.browsers = ["chrome > 83"];
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["platform.waapi-animation"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("native");
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

  it("derives omitted ownership properties before declaring a same-scope route conflict-free", () => {
    const motion = manifestFixture("motion", ["motion.layout"]);
    const gsap = manifestFixture("gsap", ["motion.timeline"]);
    const project = projectFixture();
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.layout", "motion.timeline"],
        quality: {
          "motion.layout": { scope: "hero" },
          "motion.timeline": { scope: "hero" }
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
