import { describe, expect, it } from "vitest";

import {
  validateContract,
  type CatalogSnapshot
} from "@soren-sdk/contracts";
import type { ConnectorRecord } from "@soren-sdk/core";
import { buildCatalogSnapshot } from "../src/index.js";
import {
  legacyConnectorManifest,
  repositoryRoot,
  validConnectorManifest
} from "./fixtures.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function capabilityCatalog() {
  return JSON.parse(
    await readFile(join(repositoryRoot(), "capabilities", "catalog.json"), "utf8")
  );
}

async function record(id: string): Promise<ConnectorRecord> {
  const manifest = await validConnectorManifest(id);
  return {
    kind: "schema-v2",
    directoryId: id,
    path: `/tmp/${id}/sdk.manifest.json`,
    manifest,
    selectable: manifest.connector.selectable
  };
}

describe("catalog snapshots", () => {
  it("is independent of connector order and creation time", async () => {
    const alpha = await record("alpha");
    const beta = await record("beta");
    const catalog = await capabilityCatalog();
    const first = buildCatalogSnapshot({
      capabilityCatalog: catalog,
      connectors: [beta, alpha],
      createdAt: "2026-07-28T00:00:00.000Z"
    });
    const second = buildCatalogSnapshot({
      capabilityCatalog: catalog,
      connectors: [alpha, beta],
      createdAt: "2026-07-29T00:00:00.000Z"
    });
    expect(first.snapshotId).toBe(second.snapshotId);
    expect(first.connectors.map((entry) => entry.id)).toEqual(["alpha", "beta"]);
  });

  it("changes when connector content changes", async () => {
    const alpha = await record("alpha");
    const changed = await record("alpha");
    if (changed.kind !== "schema-v2") throw new Error("Expected v2 fixture.");
    changed.manifest.connectorVersion = "0.2.1";
    const catalog = await capabilityCatalog();
    const first = buildCatalogSnapshot({
      capabilityCatalog: catalog,
      connectors: [alpha],
      createdAt: "2026-07-28T00:00:00.000Z"
    });
    const second = buildCatalogSnapshot({
      capabilityCatalog: catalog,
      connectors: [changed],
      createdAt: "2026-07-28T00:00:00.000Z"
    });
    expect(first.snapshotId).not.toBe(second.snapshotId);
  });

  it("excludes legacy records and satisfies the catalog snapshot contract", async () => {
    const alpha = await record("alpha");
    const legacy: ConnectorRecord = {
      kind: "legacy",
      directoryId: "legacy",
      path: "/tmp/legacy/sdk.manifest.json",
      schemaVersion: String(legacyConnectorManifest().schemaVersion),
      selectable: false
    };
    const snapshot = buildCatalogSnapshot({
      capabilityCatalog: await capabilityCatalog(),
      connectors: [legacy, alpha],
      createdAt: "2026-07-28T00:00:00.000Z"
    });
    expect(snapshot.connectors).toHaveLength(1);
    expect(validateContract<CatalogSnapshot>("catalog-snapshot", snapshot).ok).toBe(
      true
    );
  });
});
