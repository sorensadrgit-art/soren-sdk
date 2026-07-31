import { describe, expect, it } from "vitest";

import { routeCapabilities } from "../src/index.js";
import {
  MemoryCatalogFixture,
  manifestFixture,
  projectFixture,
  requestFixture,
  schemaRecordFixture
} from "./router-fixtures.js";

describe("router security and semantic regressions", () => {
  it("does not reuse a prerelease runtime for a stable-only dependency range", () => {
    const motion = manifestFixture("motion", ["motion.layout"]);
    const runtime = motion.integrations.find(
      (integration) => integration.kind === "runtime-package"
    );
    if (runtime === undefined) throw new Error("Expected Motion runtime.");
    runtime.version = { status: "resolved", value: "12.42.1-beta.0" };

    const project = projectFixture({ dependencies: ["motion"] });
    const dependency = project.dependencies.find(
      (item) => item.name === "motion"
    );
    if (dependency === undefined) throw new Error("Expected Motion dependency.");
    dependency.version = "^12.42.1";

    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.layout"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture([schemaRecordFixture(motion)])
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.reasonCode).toBe("CAPABILITY_MATCH");
  });

  it("rejects not-applicable licenses for runtime packages", () => {
    const motion = manifestFixture("motion", ["motion.layout"]);
    const runtime = motion.integrations.find(
      (integration) => integration.kind === "runtime-package"
    );
    if (runtime === undefined) throw new Error("Expected Motion runtime.");
    runtime.licenseExpression = "not-applicable";

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

  it("applies browser exclusions before evaluating WAAPI support", () => {
    const project = projectFixture();
    project.targets.browsers = ["chrome 120, ie 11, not ie 11"];

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
});
