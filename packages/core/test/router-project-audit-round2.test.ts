import { describe, expect, it } from "vitest";

import {
  routeCapabilities,
  type CatalogReader,
  type ConnectorRecord
} from "../src/index.js";
import {
  MemoryCatalogFixture,
  defaultRecordsFixture,
  projectFixture,
  requestFixture
} from "./router-fixtures.js";

function route(
  required: string[],
  project = projectFixture(),
  catalog: CatalogReader = new MemoryCatalogFixture()
) {
  return routeCapabilities({
    request: requestFixture({
      required,
      projectSnapshotId: project.snapshotId
    }),
    project,
    catalog
  });
}

describe("project-wide Phase 4 audit regressions", () => {
  it("does not report stable runtime reuse from an exact prerelease dependency", () => {
    const project = projectFixture();
    project.dependencies.push({
      name: "motion",
      version: "12.42.1-beta.1",
      kind: "dependency",
      workspace: "."
    });

    const plan = route(["motion.layout"], project);

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.reasonCode).toBe("CAPABILITY_MATCH");
  });

  it("requires reuse evidence for both an explicit workspace and an unscoped root target", () => {
    const project = projectFixture();
    project.workspace = {
      isMonorepo: true,
      packages: [
        { name: "root", path: ".", private: true },
        { name: "app", path: "packages/app", private: true }
      ]
    };
    project.dependencies.push({
      name: "gsap",
      version: "3.15.0",
      kind: "dependency",
      workspace: "packages/app"
    });
    const request = requestFixture({
      required: ["motion.timeline", "motion.svg"],
      projectSnapshotId: project.snapshotId
    });
    const timeline = request.capabilities.find(
      (capability) => capability.id === "motion.timeline"
    );
    if (timeline === undefined) throw new Error("Expected timeline capability.");
    timeline.quality = { workspace: "packages/app" };

    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.reasonCode).toBe("CAPABILITY_MATCH");
  });

  it("treats an ownership claim without properties as domain-wide", () => {
    const records = structuredClone(defaultRecordsFixture);
    const motion = records.find(
      (record): record is Extract<ConnectorRecord, { kind: "schema-v2" }> =>
        record.kind === "schema-v2" && record.manifest.connector.id === "motion"
    );
    if (motion === undefined) throw new Error("Expected Motion connector.");
    const timing = motion.manifest.ownershipClaims.find(
      (claim) => claim.domain === "timing"
    );
    if (timing === undefined) throw new Error("Expected timing ownership claim.");
    delete timing.properties;

    const project = projectFixture();
    const request = requestFixture({
      required: ["motion.spring"],
      projectSnapshotId: project.snapshotId,
      quality: {
        "motion.spring": { scope: "hero", property: "easing" }
      }
    });
    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture(records)
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.providerId).toBe("motion");
  });

  it("reads a mutable catalog only once at the public route boundary", () => {
    const base = new MemoryCatalogFixture();
    let listCalls = 0;
    const catalog: CatalogReader = {
      getCapabilityCatalog: () => base.getCapabilityCatalog(),
      list: () => {
        listCalls += 1;
        return listCalls === 1 ? base.list() : [];
      },
      get: (connectorId) => (listCalls <= 1 ? base.get(connectorId) : undefined),
      health: (connectorId) => base.health(connectorId),
      snapshot: (createdAt) => base.snapshot(createdAt)
    };

    const plan = route(["motion.layout"], projectFixture(), catalog);

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.providerId).toBe("motion");
    expect(listCalls).toBe(1);
  });
});
