import { describe, expect, it } from "vitest";

import { PHASE_4_POLICY, routeCapabilities } from "../src/index.js";
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

  it("preserves compatible root React declarations for a selected workspace", () => {
    const project = projectFixture({ reactVersion: "19.0.0" });
    project.workspace = {
      isMonorepo: true,
      packages: [{ name: "app", path: "apps/app", private: true }]
    };
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

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.providerId).toBe("motion");
  });

  it("prefers workspace-local React over an incompatible root declaration", () => {
    const project = projectFixture({ reactVersion: "17.0.2" });
    project.workspace = {
      isMonorepo: true,
      packages: [{ name: "app", path: "apps/app", private: true }]
    };
    project.dependencies.push({
      name: "react",
      version: "19.0.0",
      kind: "dependency",
      workspace: "apps/app"
    });
    project.frameworks.push({
      name: "react",
      version: "19.0.0",
      workspace: "apps/app"
    });
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

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.providerId).toBe("motion");
  });

  it("does not let an unrelated capability choose the React workspace", () => {
    const project = projectFixture();
    project.workspace = {
      isMonorepo: true,
      packages: [
        { name: "legacy", path: "apps/legacy", private: true },
        { name: "modern", path: "apps/modern", private: true }
      ]
    };
    project.dependencies = [
      ...project.dependencies.filter((dependency) => dependency.name !== "react"),
      {
        name: "react",
        version: "17.0.2",
        kind: "dependency",
        workspace: "apps/legacy"
      },
      {
        name: "react",
        version: "19.0.0",
        kind: "dependency",
        workspace: "apps/modern"
      }
    ];
    project.frameworks = [
      { name: "react", version: "17.0.2", workspace: "apps/legacy" },
      { name: "react", version: "19.0.0", workspace: "apps/modern" }
    ];
    const request = requestFixture({
      required: ["motion.spring", "motion.timeline"],
      projectSnapshotId: project.snapshotId
    });
    const timeline = request.capabilities.find(
      (capability) => capability.id === "motion.timeline"
    );
    if (timeline === undefined) throw new Error("Expected timeline capability.");
    timeline.quality = { workspace: "apps/modern" };

    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("needs-input");
    expect(plan.requiredInput).toContain("target workspace");
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

  it("blocks runtime packages when a finite bundle limit cannot be proven", () => {
    const project = projectFixture();
    const policy = structuredClone(PHASE_4_POLICY);
    policy.rules.maxBundleKilobytes = 0;
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.layout"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture(),
      policy
    });

    expect(plan.status).toBe("blocked");
    expect(plan.selectedProviders).toEqual([]);
  });

  it("rejects runtime packages without a resolved version", () => {
    const motion = manifestFixture("motion", ["motion.layout"]);
    const runtime = motion.integrations.find(
      (integration) => integration.kind === "runtime-package"
    );
    if (runtime === undefined) throw new Error("Expected Motion runtime package.");
    runtime.version = { status: "not-applicable" };
    const project = projectFixture();
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.layout"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture([schemaRecordFixture(motion)])
    });

    expect(plan.status).toBe("blocked");
    expect(plan.selectedProviders).toEqual([]);
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

  it("inspects arbitrary SVG quality fields for plugin-dependent requirements", () => {
    const project = projectFixture();
    const request = requestFixture({
      required: ["motion.svg"],
      projectSnapshotId: project.snapshotId
    });
    const capability = request.capabilities[0];
    if (capability === undefined) throw new Error("Expected SVG capability.");
    capability.quality = { feature: "path-morph" };

    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("blocked");
    expect(plan.selectedProviders).toEqual([]);
  });

  it("inspects SVG quality keys when boolean values carry the requirement", () => {
    const project = projectFixture();
    const request = requestFixture({
      required: ["motion.svg"],
      projectSnapshotId: project.snapshotId
    });
    const capability = request.capabilities[0];
    if (capability === undefined) throw new Error("Expected SVG capability.");
    capability.quality = { morph: true };

    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("blocked");
    expect(plan.selectedProviders).toEqual([]);
  });
});
