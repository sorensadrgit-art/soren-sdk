import { describe, expect, it } from "vitest";

import { routeCapabilities, type ConnectorRecord } from "../src/index.js";
import {
  MemoryCatalogFixture,
  defaultRecordsFixture,
  projectFixture,
  requestFixture
} from "./router-fixtures.js";

function routeMotionWithDependency(version: string) {
  const project = projectFixture();
  project.dependencies.push({
    name: "motion",
    version,
    kind: "dependency",
    workspace: "."
  });
  return routeCapabilities({
    request: requestFixture({
      required: ["motion.layout"],
      projectSnapshotId: project.snapshotId
    }),
    project,
    catalog: new MemoryCatalogFixture()
  });
}

describe("final Phase 4 review wave", () => {
  it.each(["12.x", "12.*"])(
    "accepts the npm major X-range %s for dependency reuse",
    (range) => {
      const plan = routeMotionWithDependency(range);
      expect(plan.status).toBe("selected");
      expect(plan.selectedProviders[0]?.reasonCode).toBe(
        "EXISTING_DEPENDENCY_REUSE"
      );
    }
  );

  it.each(["workspace:*", "workspace:^12.42.1"])(
    "does not treat local workspace protocol %s as approved registry reuse",
    (range) => {
      const plan = routeMotionWithDependency(range);
      expect(plan.status).toBe("selected");
      expect(plan.selectedProviders[0]?.reasonCode).toBe("CAPABILITY_MATCH");
    }
  );

  it("rejects a connector with duplicate runtime integration IDs before plan construction", () => {
    const records = structuredClone(defaultRecordsFixture);
    const motion = records.find(
      (record): record is Extract<ConnectorRecord, { kind: "schema-v2" }> =>
        record.kind === "schema-v2" && record.manifest.connector.id === "motion"
    );
    if (motion === undefined) throw new Error("Expected Motion connector.");
    const runtime = motion.manifest.integrations.find(
      (integration) => integration.kind === "runtime-package"
    );
    if (runtime === undefined) throw new Error("Expected Motion runtime.");
    motion.manifest.integrations.push(structuredClone(runtime));

    const project = projectFixture();
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.layout"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture(records)
    });

    expect(plan.status).toBe("blocked");
    expect(plan.selectedProviders).toEqual([]);
    expect(plan.rejectedProviders).toContainEqual(
      expect.objectContaining({
        providerId: "motion",
        reasonCode: "CONNECTOR_UNHEALTHY"
      })
    );
  });

  it("binds a legacy Phase 4 record into the route-time catalog snapshot", () => {
    const withoutMotion = structuredClone(defaultRecordsFixture).filter(
      (record) =>
        record.kind !== "schema-v2" || record.manifest.connector.id !== "motion"
    );
    const withLegacyMotion: ConnectorRecord[] = [
      ...structuredClone(withoutMotion),
      {
        kind: "legacy",
        directoryId: "motion",
        path: "/catalog/motion/sdk.manifest.json",
        schemaVersion: "1.0.0-planning",
        selectable: false
      }
    ];
    const project = projectFixture();
    const request = requestFixture({
      required: ["motion.layout"],
      projectSnapshotId: project.snapshotId
    });

    const absent = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture(withoutMotion)
    });
    const legacy = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture(withLegacyMotion)
    });

    expect(absent.status).toBe("blocked");
    expect(legacy.status).toBe("blocked");
    expect(legacy.rejectedProviders).toContainEqual(
      expect.objectContaining({
        providerId: "motion",
        reasonCode: "CONNECTOR_UNHEALTHY"
      })
    );
    expect(legacy.catalogSnapshotId).not.toBe(absent.catalogSnapshotId);
  });
});
