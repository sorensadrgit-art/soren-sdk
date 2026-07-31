import {
  ContractValidationError,
  type ProjectSnapshot
} from "@soren-sdk/contracts";
import { describe, expect, it } from "vitest";

import { routeCapabilities } from "../src/index.js";
import {
  MemoryCatalogFixture,
  projectFixture,
  requestFixture
} from "./router-fixtures.js";

function twoWorkspaceProject(): ProjectSnapshot {
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

describe("latest Codex routing wave", () => {
  it("rejects a stale Project Snapshot content digest", () => {
    const project = projectFixture();
    const staleSnapshotId = project.snapshotId;
    const request = requestFixture({
      required: ["motion.layout"],
      projectSnapshotId: staleSnapshotId
    });
    project.targets = {
      ...project.targets,
      browsers: ["ie 11"]
    };
    Object.defineProperty(project, "snapshotId", {
      configurable: true,
      enumerable: true,
      value: staleSnapshotId
    });

    expect(() =>
      routeCapabilities({
        request,
        project,
        catalog: new MemoryCatalogFixture()
      })
    ).toThrow(ContractValidationError);
  });

  it("routes React-dependent Motion capabilities across explicit workspaces", () => {
    const project = twoWorkspaceProject();
    const request = requestFixture({
      required: ["motion.presence", "motion.spring"],
      projectSnapshotId: project.snapshotId
    });
    const presence = request.capabilities.find(
      (capability) => capability.id === "motion.presence"
    );
    const spring = request.capabilities.find(
      (capability) => capability.id === "motion.spring"
    );
    if (presence === undefined || spring === undefined) {
      throw new Error("Expected Motion capabilities.");
    }
    presence.quality = { workspace: "packages/app" };
    spring.quality = { workspace: "packages/admin" };

    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(plan.requiredInput).toEqual([]);
    expect(plan.selectedProviders.map((provider) => provider.providerId)).toEqual([
      "motion"
    ]);
  });

  it("uses root dependency fallback only where no target-local declaration exists", () => {
    const project = twoWorkspaceProject();
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
      required: ["motion.timeline", "motion.svg"],
      projectSnapshotId: project.snapshotId
    });
    const timeline = request.capabilities.find(
      (capability) => capability.id === "motion.timeline"
    );
    const svg = request.capabilities.find(
      (capability) => capability.id === "motion.svg"
    );
    if (timeline === undefined || svg === undefined) {
      throw new Error("Expected GSAP capabilities.");
    }
    timeline.quality = { workspace: "packages/app" };
    svg.quality = { workspace: "packages/admin" };

    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.reasonCode).toBe("CAPABILITY_MATCH");
  });
});
