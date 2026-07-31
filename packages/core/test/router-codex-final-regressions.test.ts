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
