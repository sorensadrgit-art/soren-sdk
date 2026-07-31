import {
  digestJson,
  type Digest,
  type JsonValue,
  type ProjectSnapshot
} from "@soren-sdk/contracts";
import { describe, expect, it } from "vitest";

import {
  PHASE_4_POLICY,
  routeCapabilities,
  type CatalogReader,
  type ConnectorRecord
} from "../src/index.js";
import {
  MemoryCatalogFixture,
  projectFixture,
  requestFixture
} from "./router-fixtures.js";

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function connectorSnapshot(catalog: CatalogReader) {
  return catalog
    .list()
    .filter(
      (record): record is Extract<ConnectorRecord, { kind: "schema-v2" }> =>
        record.kind === "schema-v2"
    )
    .map((record) => {
      const connectorId = record.manifest.connector.id;
      return {
        id: connectorId,
        connectorVersion: record.manifest.connectorVersion,
        digest: digestJson(
          json({ manifest: record.manifest, health: catalog.health(connectorId) })
        ),
        reviewStatus: record.manifest.connector.reviewStatus,
        selectable: record.manifest.connector.selectable
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function expectedCatalogSnapshotId(catalog: CatalogReader): Digest {
  return digestJson({
    capabilityCatalogDigest: digestJson(json(catalog.getCapabilityCatalog())),
    connectors: connectorSnapshot(catalog)
  });
}

function staleSnapshotCatalog(base: MemoryCatalogFixture): CatalogReader {
  const stale = structuredClone(base.snapshot());
  const first = stale.connectors[0];
  if (first === undefined) throw new Error("Expected a connector snapshot entry.");
  first.digest = `sha256:${"f".repeat(64)}` as Digest;
  stale.snapshotId = digestJson({
    capabilityCatalogDigest: stale.capabilityCatalogDigest,
    connectors: stale.connectors
  });
  return {
    getCapabilityCatalog: () => base.getCapabilityCatalog(),
    list: () => base.list(),
    get: (connectorId) => base.get(connectorId),
    health: (connectorId) => base.health(connectorId),
    snapshot: () => stale
  };
}

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

describe("final Codex review regressions", () => {
  it("derives the catalog snapshot from the records actually routed", () => {
    const base = new MemoryCatalogFixture();
    const catalog = staleSnapshotCatalog(base);
    const project = projectFixture();

    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.layout"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog
    });

    expect(plan.status).toBe("selected");
    expect(plan.catalogSnapshotId).toBe(expectedCatalogSnapshotId(base));
    expect(plan.catalogSnapshotId).not.toBe(catalog.snapshot().snapshotId);
  });

  it("namespaces identical ownership scopes by workspace", () => {
    const project = twoWorkspaceProject();
    const request = requestFixture({
      required: ["motion.layout", "motion.timeline"],
      projectSnapshotId: project.snapshotId
    });
    const layout = request.capabilities.find((item) => item.id === "motion.layout");
    const timeline = request.capabilities.find(
      (item) => item.id === "motion.timeline"
    );
    if (layout === undefined || timeline === undefined) {
      throw new Error("Expected layout and timeline capabilities.");
    }
    layout.quality = {
      workspace: "packages/app",
      scope: "hero",
      property: "transform"
    };
    timeline.quality = {
      workspace: "packages/admin",
      scope: "hero",
      property: "transform"
    };

    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(
      plan.selectedProviders.map((provider) => provider.providerId).sort()
    ).toEqual(["gsap", "motion"]);
    expect(new Set(plan.ownership.map((entry) => entry.scope)).size).toBe(2);
  });

  it("normalizes explicit and omitted root workspaces for ownership", () => {
    const project = projectFixture();
    const request = requestFixture({
      required: ["motion.layout", "motion.timeline"],
      projectSnapshotId: project.snapshotId
    });
    const layout = request.capabilities.find((item) => item.id === "motion.layout");
    const timeline = request.capabilities.find(
      (item) => item.id === "motion.timeline"
    );
    if (layout === undefined || timeline === undefined) {
      throw new Error("Expected layout and timeline capabilities.");
    }
    layout.quality = {
      workspace: ".",
      scope: "hero",
      property: "transform"
    };
    timeline.quality = { scope: "hero", property: "transform" };

    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("blocked");
    expect(plan.selectedProviders).toEqual([]);
    expect(plan.constraints).toContainEqual(
      expect.objectContaining({ code: "OWNERSHIP_CONFLICT", status: "failed" })
    );
  });

  it("binds effective connector health into the catalog snapshot", () => {
    const healthyCatalog = new MemoryCatalogFixture();
    const blockedCatalog: CatalogReader = {
      getCapabilityCatalog: () => healthyCatalog.getCapabilityCatalog(),
      list: () => healthyCatalog.list(),
      get: (connectorId) => healthyCatalog.get(connectorId),
      health: (connectorId) => {
        const health = healthyCatalog.health(connectorId);
        return connectorId === "motion"
          ? {
              ...health,
              state: "blocked",
              selectable: false,
              blockers: ["missing related skill file"]
            }
          : health;
      },
      snapshot: (createdAt) => healthyCatalog.snapshot(createdAt)
    };
    const project = projectFixture();
    const request = requestFixture({
      required: ["motion.layout"],
      projectSnapshotId: project.snapshotId
    });

    const healthy = routeCapabilities({
      request,
      project,
      catalog: healthyCatalog
    });
    const blocked = routeCapabilities({
      request,
      project,
      catalog: blockedCatalog
    });

    expect(healthy.status).toBe("selected");
    expect(blocked.status).toBe("blocked");
    expect(blocked.catalogSnapshotId).not.toBe(healthy.catalogSnapshotId);
  });

  it("scopes reuse to each provider's requested workspaces", () => {
    const project = twoWorkspaceProject();
    project.dependencies.push(
      {
        name: "motion",
        version: "12.42.1",
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
    const request = requestFixture({
      required: ["motion.layout", "motion.timeline"],
      projectSnapshotId: project.snapshotId
    });
    const layout = request.capabilities.find((item) => item.id === "motion.layout");
    const timeline = request.capabilities.find(
      (item) => item.id === "motion.timeline"
    );
    if (layout === undefined || timeline === undefined) {
      throw new Error("Expected layout and timeline capabilities.");
    }
    layout.quality = { workspace: "packages/app" };
    timeline.quality = { workspace: "packages/admin" };

    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(
      Object.fromEntries(
        plan.selectedProviders.map((provider) => [
          provider.providerId,
          provider.reasonCode
        ])
      )
    ).toEqual({
      gsap: "EXISTING_DEPENDENCY_REUSE",
      motion: "EXISTING_DEPENDENCY_REUSE"
    });
  });

  it("expands partial React comparators in framework records", () => {
    const project = projectFixture({ reactVersion: null });
    project.workspace = {
      isMonorepo: true,
      packages: [{ name: "app", path: "packages/app", private: true }]
    };
    project.frameworks = [
      { name: "react", version: ">18.1", workspace: "packages/app" }
    ];
    const request = requestFixture({
      required: ["motion.layout"],
      projectSnapshotId: project.snapshotId
    });
    const layout = request.capabilities[0];
    if (layout === undefined) throw new Error("Expected layout capability.");
    layout.quality = { workspace: "packages/app" };

    const plan = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.providerId).toBe("motion");
  });

  it("treats an omitted bundle budget as unrestricted", () => {
    const policy = structuredClone(PHASE_4_POLICY);
    delete policy.rules.maxBundleKilobytes;
    const project = projectFixture();

    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.layout"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture(),
      policy
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders[0]?.providerId).toBe("motion");
  });
});
