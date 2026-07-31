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
