import { describe, expect, it } from "vitest";

import { PHASE_4_POLICY, routeCapabilities } from "../src/index.js";
import {
  MemoryCatalogFixture,
  manifestFixture,
  projectFixture,
  requestFixture,
  schemaRecordFixture
} from "./router-fixtures.js";

function selectedReason(plan: ReturnType<typeof routeCapabilities>): string | undefined {
  return plan.selectedProviders[0]?.reasonCode;
}

describe("independent review: environment compatibility", () => {
  it("blocks WAAPI when inspected browser targets include IE 11", () => {
    const project = projectFixture();
    project.targets.browsers = ["ie 11"];

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

  it("does not treat Browserslist exclusions as positive WAAPI targets", () => {
    const project = projectFixture();
    project.targets.browsers = ["defaults", "not ie 11", "not op_mini all"];

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

  it("blocks Motion when the declared React range excludes React 18.2", () => {
    const project = projectFixture({ reactVersion: "<18.2.0" });

    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.layout"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("blocked");
    expect(plan.rejectedProviders).toContainEqual(
      expect.objectContaining({
        providerId: "motion",
        reasonCode: "ENVIRONMENT_UNSUPPORTED"
      })
    );
  });
});

describe("independent review: integration policy", () => {
  it("rejects runtime network hosts outside a policy allowlist", () => {
    const motion = manifestFixture("motion", ["motion.spring"]);
    const runtime = motion.integrations.find(
      (integration) => integration.id === "motion-runtime"
    );
    if (runtime === undefined) throw new Error("Expected Motion runtime fixture.");
    runtime.permissions.network = ["denied.example"];

    const project = projectFixture();
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.spring"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture([schemaRecordFixture(motion)]),
      policy: {
        ...PHASE_4_POLICY,
        rules: {
          ...PHASE_4_POLICY.rules,
          network: {
            mode: "allowlist",
            allowedHosts: ["allowed.example"]
          }
        }
      }
    });

    expect(plan.status).toBe("blocked");
    expect(plan.rejectedProviders).toContainEqual(
      expect.objectContaining({
        providerId: "motion",
        reasonCode: "POLICY_DENIED"
      })
    );
  });

  it("rejects a runtime that requires an unavailable authorization grant", () => {
    const motion = manifestFixture("motion", ["motion.spring"]);
    const runtime = motion.integrations.find(
      (integration) => integration.id === "motion-runtime"
    );
    if (runtime === undefined) throw new Error("Expected Motion runtime fixture.");
    runtime.authorization = {
      required: true,
      method: "oauth",
      paidPlan: false
    };

    const project = projectFixture();
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.spring"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture([schemaRecordFixture(motion)])
    });

    expect(plan.status).toBe("blocked");
    expect(plan.rejectedProviders).toContainEqual(
      expect.objectContaining({
        providerId: "motion",
        reasonCode: "POLICY_DENIED"
      })
    );
  });
});

describe("independent review: dependency reuse", () => {
  it("treats framer-motion as a migration signal, not runtime reuse", () => {
    const project = projectFixture({ dependencies: ["framer-motion"] });

    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.presence"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(selectedReason(plan)).toBe("CAPABILITY_MATCH");
  });

  it("does not reuse an installed runtime package with an incompatible version", () => {
    const project = projectFixture({ dependencies: ["motion"] });
    const motion = project.dependencies.find(
      (dependency) => dependency.name === "motion"
    );
    if (motion === undefined) throw new Error("Expected Motion dependency fixture.");
    motion.version = "11.0.0";

    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.spring"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(selectedReason(plan)).toBe("CAPABILITY_MATCH");
  });

  it("reuses an installed runtime package when its range includes the pinned version", () => {
    const project = projectFixture({ dependencies: ["motion"] });
    const motion = project.dependencies.find(
      (dependency) => dependency.name === "motion"
    );
    if (motion === undefined) throw new Error("Expected Motion dependency fixture.");
    motion.version = "^12.0.0";

    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.spring"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(selectedReason(plan)).toBe("EXISTING_DEPENDENCY_REUSE");
  });
});
