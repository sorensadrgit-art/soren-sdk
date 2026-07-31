import { describe, expect, it } from "vitest";

import { routeCapabilities } from "../src/index.js";
import {
  MemoryCatalogFixture,
  manifestFixture,
  projectFixture,
  requestFixture,
  schemaRecordFixture
} from "./router-fixtures.js";

function mixedReactProject() {
  const project = projectFixture({ reactVersion: null });
  project.workspace = {
    isMonorepo: true,
    packages: [
      { name: "legacy", path: "apps/legacy", private: true },
      { name: "modern", path: "apps/modern", private: true }
    ]
  };
  project.dependencies = [
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
  return project;
}

describe("latest Codex routing regressions", () => {
  it("preserves a hard provider failure instead of replacing it with workspace input", () => {
    const project = mixedReactProject();
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.spring"],
        forbidden: ["motion"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("blocked");
    expect(plan.requiredInput).toEqual([]);
    expect(plan.rejectedProviders).toContainEqual(
      expect.objectContaining({
        providerId: "motion",
        reasonCode: "FORBIDDEN_PROVIDER"
      })
    );
  });

  it("requests a valid target workspace when the supplied workspace does not exist", () => {
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
    capability.quality = { workspace: "apps/missing" };

    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("needs-input");
    expect(plan.requiredInput).toContain("target workspace");
  });

  it("treats an unknown React version in another workspace as ambiguity", () => {
    const project = projectFixture({ reactVersion: null });
    project.workspace = {
      isMonorepo: true,
      packages: [
        { name: "known", path: "apps/known", private: true },
        { name: "unknown", path: "apps/unknown", private: true }
      ]
    };
    project.dependencies = [
      {
        name: "react",
        version: "19.0.0",
        kind: "dependency",
        workspace: "apps/known"
      },
      {
        name: "react",
        version: null,
        kind: "dependency",
        workspace: "apps/unknown"
      }
    ];
    project.frameworks = [];

    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.layout"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("needs-input");
    expect(plan.requiredInput).toContain("target workspace");
  });

  it.each(["MorphSVGPlugin", "DrawSVGPlugin"])(
    "blocks a full GSAP plugin identifier without an approved artifact: %s",
    (plugin) => {
      const project = projectFixture();
      const request = requestFixture({
        required: ["motion.svg"],
        projectSnapshotId: project.snapshotId
      });
      const capability = request.capabilities[0];
      if (capability === undefined) throw new Error("Expected SVG capability.");
      capability.quality = { plugin };

      const plan = routeCapabilities({
        request,
        project,
        catalog: new MemoryCatalogFixture()
      });

      expect(plan.status).toBe("blocked");
      expect(plan.selectedProviders).toEqual([]);
    }
  );

  it.each(["1.2.3-01", "1.2.3-.."])(
    "rejects a runtime package with an invalid semantic version: %s",
    (version) => {
      const motion = manifestFixture("motion", ["motion.layout"]);
      const runtime = motion.integrations.find(
        (integration) => integration.kind === "runtime-package"
      );
      if (runtime === undefined) throw new Error("Expected Motion runtime package.");
      runtime.version = { status: "resolved", value: version };
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
    }
  );
});
