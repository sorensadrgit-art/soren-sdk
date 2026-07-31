import { describe, expect, it } from "vitest";

import { routeCapabilities } from "../src/index.js";
import {
  MemoryCatalogFixture,
  projectFixture,
  requestFixture
} from "./router-fixtures.js";

function multiWorkspaceRequest(projectSnapshotId: string) {
  const request = requestFixture({
    required: ["motion.timeline", "motion.svg"],
    projectSnapshotId: projectSnapshotId as `sha256:${string}`
  });
  const timeline = request.capabilities.find(
    (capability) => capability.id === "motion.timeline"
  );
  const svg = request.capabilities.find(
    (capability) => capability.id === "motion.svg"
  );
  if (timeline === undefined || svg === undefined) {
    throw new Error("Expected timeline and SVG capabilities.");
  }
  timeline.quality = { workspace: "packages/app" };
  svg.quality = { workspace: "packages/admin" };
  return request;
}

describe("multi-workspace dependency reuse", () => {
  it("does not claim reuse from an unrelated third workspace", () => {
    const project = projectFixture();
    project.workspace = {
      isMonorepo: true,
      packages: [
        { name: "app", path: "packages/app", private: true },
        { name: "admin", path: "packages/admin", private: true },
        { name: "tools", path: "packages/tools", private: true }
      ]
    };
    project.dependencies.push({
      name: "gsap",
      version: "3.15.0",
      kind: "dependency",
      workspace: "packages/tools"
    });

    const plan = routeCapabilities({
      request: multiWorkspaceRequest(project.snapshotId),
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.reasonCode).toBe("CAPABILITY_MATCH");
  });

  it("claims reuse only when every target workspace has the runtime", () => {
    const project = projectFixture();
    project.workspace = {
      isMonorepo: true,
      packages: [
        { name: "app", path: "packages/app", private: true },
        { name: "admin", path: "packages/admin", private: true }
      ]
    };
    project.dependencies.push(
      {
        name: "gsap",
        version: "3.15.0",
        kind: "dependency",
        workspace: "packages/app"
      },
      {
        name: "gsap",
        version: "3.15.0",
        kind: "dependency",
        workspace: "packages/admin"
      }
    );

    const plan = routeCapabilities({
      request: multiWorkspaceRequest(project.snapshotId),
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.reasonCode).toBe(
      "EXISTING_DEPENDENCY_REUSE"
    );
  });
});
