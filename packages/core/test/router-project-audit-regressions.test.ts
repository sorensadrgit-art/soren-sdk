import { describe, expect, it } from "vitest";

import { routeCapabilities } from "../src/index.js";
import {
  MemoryCatalogFixture,
  projectFixture,
  requestFixture
} from "./router-fixtures.js";

function twoWorkspaceMotionProject() {
  const project = projectFixture({ reactVersion: null });
  project.workspace = {
    isMonorepo: true,
    packages: [
      { name: "app", path: "packages/app", private: true },
      { name: "admin", path: "packages/admin", private: true }
    ]
  };
  project.dependencies = [
    {
      name: "react",
      version: "19.0.0",
      kind: "dependency",
      workspace: "packages/app"
    },
    {
      name: "react",
      version: "19.0.0",
      kind: "dependency",
      workspace: "packages/admin"
    }
  ];
  project.frameworks = [
    { name: "react", version: "19.0.0", workspace: "packages/app" },
    { name: "react", version: "19.0.0", workspace: "packages/admin" }
  ];
  return project;
}

function twoWorkspaceMotionRequest(projectSnapshotId: string) {
  const request = requestFixture({
    required: ["motion.presence", "motion.spring"],
    projectSnapshotId: projectSnapshotId as `sha256:${string}`
  });
  const presence = request.capabilities.find(
    (capability) => capability.id === "motion.presence"
  );
  const spring = request.capabilities.find(
    (capability) => capability.id === "motion.spring"
  );
  if (presence === undefined || spring === undefined) {
    throw new Error("Expected presence and spring capabilities.");
  }
  presence.quality = { workspace: "packages/app" };
  spring.quality = { workspace: "packages/admin" };
  return request;
}

describe("project-wide audit routing regressions", () => {
  it("preserves npm alias identity across multiple target workspaces", () => {
    const project = twoWorkspaceMotionProject();
    project.dependencies.push(
      {
        name: "motion",
        version: "npm:@acme/motion-fork@12.42.1",
        kind: "dependency",
        workspace: "packages/app"
      },
      {
        name: "motion",
        version: "12.42.1",
        kind: "dependency",
        workspace: "packages/admin"
      }
    );

    const plan = routeCapabilities({
      request: twoWorkspaceMotionRequest(project.snapshotId),
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders).toContainEqual(
      expect.objectContaining({
        providerId: "motion",
        reasonCode: "CAPABILITY_MATCH"
      })
    );
  });

  it("accepts spaced comparators during multi-workspace reuse", () => {
    const project = twoWorkspaceMotionProject();
    project.dependencies.push(
      {
        name: "motion",
        version: ">= 12.42.1",
        kind: "dependency",
        workspace: "packages/app"
      },
      {
        name: "motion",
        version: ">= 12.42.1",
        kind: "dependency",
        workspace: "packages/admin"
      }
    );

    const plan = routeCapabilities({
      request: twoWorkspaceMotionRequest(project.snapshotId),
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders).toContainEqual(
      expect.objectContaining({
        providerId: "motion",
        reasonCode: "EXISTING_DEPENDENCY_REUSE"
      })
    );
  });

  it("does not let one provider workspace shadow another provider root dependency", () => {
    const project = projectFixture({ reactVersion: null });
    project.workspace = {
      isMonorepo: true,
      packages: [{ name: "app", path: "packages/app", private: true }]
    };
    project.dependencies = [
      {
        name: "react",
        version: "19.0.0",
        kind: "dependency",
        workspace: "packages/app"
      },
      {
        name: "motion",
        version: "12.42.1",
        kind: "dependency",
        workspace: "packages/app"
      },
      {
        name: "gsap",
        version: "2.0.0",
        kind: "dependency",
        workspace: "packages/app"
      },
      {
        name: "gsap",
        version: "3.15.0",
        kind: "dependency",
        workspace: "."
      }
    ];
    project.frameworks = [
      { name: "react", version: "19.0.0", workspace: "packages/app" }
    ];
    const request = requestFixture({
      required: ["motion.layout", "motion.timeline"],
      projectSnapshotId: project.snapshotId
    });
    const layout = request.capabilities.find(
      (capability) => capability.id === "motion.layout"
    );
    if (layout === undefined) throw new Error("Expected layout capability.");
    layout.quality = { workspace: "packages/app" };

    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders).toContainEqual(
      expect.objectContaining({
        providerId: "motion",
        reasonCode: "EXISTING_DEPENDENCY_REUSE"
      })
    );
    expect(plan.selectedProviders).toContainEqual(
      expect.objectContaining({
        providerId: "gsap",
        reasonCode: "EXISTING_DEPENDENCY_REUSE"
      })
    );
  });
});
