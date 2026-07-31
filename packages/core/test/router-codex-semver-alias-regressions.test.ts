import { describe, expect, it } from "vitest";

import { routeCapabilities } from "../src/index.js";
import {
  MemoryCatalogFixture,
  manifestFixture,
  projectFixture,
  requestFixture,
  schemaRecordFixture
} from "./router-fixtures.js";

function productionMotionCatalog(): MemoryCatalogFixture {
  const motion = manifestFixture("motion", ["motion.layout"]);
  const runtime = motion.integrations.find(
    (integration) =>
      integration.kind === "runtime-package" &&
      integration.packageName === "motion"
  );
  if (runtime === undefined) throw new Error("Expected Motion runtime.");
  runtime.version = { status: "resolved", value: "12.42.2" };
  return new MemoryCatalogFixture([schemaRecordFixture(motion)]);
}

describe("npm alias and hyphen-range reuse regressions", () => {
  it("does not reuse npm aliases that target a different package", () => {
    const project = projectFixture({ dependencies: ["motion"] });
    const dependency = project.dependencies.find(
      (item) => item.name === "motion"
    );
    if (dependency === undefined) throw new Error("Expected Motion dependency.");
    dependency.version = "npm:@acme/motion-fork@12.42.2";

    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.layout"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: productionMotionCatalog()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.reasonCode).toBe("CAPABILITY_MATCH");
  });

  it("keeps spaced comparators intact for dependency reuse", () => {
    const project = projectFixture({ dependencies: ["motion"] });
    const dependency = project.dependencies.find(
      (item) => item.name === "motion"
    );
    if (dependency === undefined) throw new Error("Expected Motion dependency.");
    dependency.version = ">= 12.42.2";

    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.layout"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: productionMotionCatalog()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.reasonCode).toBe(
      "EXISTING_DEPENDENCY_REUSE"
    );
  });

  it("preserves root dependencies for an explicit root workspace", () => {
    const project = projectFixture({ dependencies: ["motion"] });
    const request = requestFixture({
      required: ["motion.layout"],
      projectSnapshotId: project.snapshotId
    });
    const layout = request.capabilities[0];
    if (layout === undefined) throw new Error("Expected layout capability.");
    layout.quality = { workspace: "." };

    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.reasonCode).toBe(
      "EXISTING_DEPENDENCY_REUSE"
    );
  });

  it("does not treat the latest dist-tag as dependency reuse", () => {
    const project = projectFixture({ dependencies: ["motion"] });
    const dependency = project.dependencies.find(
      (item) => item.name === "motion"
    );
    if (dependency === undefined) throw new Error("Expected Motion dependency.");
    dependency.version = "latest";

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

  it("expands partial hyphen upper bounds for dependency reuse", () => {
    const project = projectFixture({ dependencies: ["motion"] });
    const dependency = project.dependencies.find(
      (item) => item.name === "motion"
    );
    if (dependency === undefined) throw new Error("Expected Motion dependency.");
    dependency.version = "12 - 12.42";

    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.layout"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: productionMotionCatalog()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.reasonCode).toBe(
      "EXISTING_DEPENDENCY_REUSE"
    );
  });
});
