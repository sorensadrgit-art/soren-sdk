import {
  ContractValidationError,
  type ProjectSnapshot,
  type RouteRequest
} from "@soren-sdk/contracts";
import { describe, expect, it } from "vitest";

import { routeCapabilities } from "../src/index.js";
import {
  MemoryCatalogFixture,
  manifestFixture,
  projectFixture,
  requestFixture,
  schemaRecordFixture
} from "./router-fixtures.js";

function monorepoWithMixedReactVersions(): ProjectSnapshot {
  const project = projectFixture();
  project.workspace = {
    isMonorepo: true,
    packages: [
      { name: "legacy-app", path: "apps/legacy", private: true },
      { name: "modern-app", path: "apps/modern", private: true }
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
  return project;
}

describe("final Codex routing regressions", () => {
  it("requires an eligible base runtime before accepting companion-backed claims", () => {
    const gsap = manifestFixture("gsap", ["motion.timeline"]);
    const baseRuntime = gsap.integrations.find(
      (integration) => integration.id === "gsap-runtime"
    );
    if (baseRuntime === undefined) {
      throw new Error("Expected GSAP base runtime fixture.");
    }
    baseRuntime.authorization = {
      required: true,
      method: "oauth",
      paidPlan: false
    };

    const project = projectFixture();
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.timeline"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture([schemaRecordFixture(gsap)])
    });

    expect(plan.status).toBe("blocked");
    expect(plan.selectedProviders).toEqual([]);
  });

  it("does not approve WAAPI for the named Browserslist query dead", () => {
    const project = projectFixture();
    project.targets.browsers = ["dead"];
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
      expect.objectContaining({
        code: "ENVIRONMENT_UNSUPPORTED",
        status: "failed"
      })
    );
  });

  it("rejects explicit Safari versions without the required WAAPI surface", () => {
    const project = projectFixture();
    project.targets.browsers = ["safari 8"];
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

  it("keeps a proven modern Safari WAAPI route native", () => {
    const project = projectFixture();
    project.targets.browsers = ["safari 17"];
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

  it("blocks plugin-dependent SVG morphing without an approved artifact", () => {
    const project = projectFixture();
    const request = requestFixture({
      required: ["motion.svg"],
      projectSnapshotId: project.snapshotId
    });
    const capability = request.capabilities[0];
    if (capability === undefined) throw new Error("Expected SVG capability.");
    capability.quality = { technique: "path-morph" };

    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("blocked");
    expect(plan.selectedProviders).toEqual([]);
  });

  it("requires a target workspace when React ranges disagree", () => {
    const project = monorepoWithMixedReactVersions();
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

  it("routes Motion against an explicitly selected compatible workspace", () => {
    const project = monorepoWithMixedReactVersions();
    const request = requestFixture({
      required: ["motion.layout"],
      projectSnapshotId: project.snapshotId
    });
    const capability = request.capabilities[0];
    if (capability === undefined) throw new Error("Expected Motion capability.");
    capability.quality = { workspace: "apps/modern" };

    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.providerId).toBe("motion");
  });

  it("blocks Motion for an explicitly selected incompatible workspace", () => {
    const project = monorepoWithMixedReactVersions();
    const request = requestFixture({
      required: ["motion.layout"],
      projectSnapshotId: project.snapshotId
    });
    const capability = request.capabilities[0];
    if (capability === undefined) throw new Error("Expected Motion capability.");
    capability.quality = { workspace: "apps/legacy" };

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

  it("validates an invalid request before reading capability fields", () => {
    const project = projectFixture();
    const invalid = {
      ...requestFixture({
        required: ["motion.timeline"],
        projectSnapshotId: project.snapshotId
      }),
      capabilities: null
    } as unknown as RouteRequest;

    expect(() =>
      routeCapabilities({
        request: invalid,
        project,
        catalog: new MemoryCatalogFixture()
      })
    ).toThrow(ContractValidationError);
  });

  it("validates an invalid project before reading browser target fields", () => {
    const project = {
      ...projectFixture(),
      targets: { browsers: null, runtimes: ["node >=24"] }
    } as unknown as ProjectSnapshot;
    const request = requestFixture({
      required: ["platform.waapi-animation"],
      projectSnapshotId: project.snapshotId
    });

    expect(() =>
      routeCapabilities({
        request,
        project,
        catalog: new MemoryCatalogFixture()
      })
    ).toThrow(ContractValidationError);
  });
});
