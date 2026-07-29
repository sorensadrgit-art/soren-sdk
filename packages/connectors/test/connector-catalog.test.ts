import { describe, expect, it } from "vitest";

import {
  ConnectorCatalogError,
  FileSystemConnectorCatalog
} from "../src/index.js";
import {
  createCatalogFixture,
  legacyConnectorManifest,
  validConnectorManifest
} from "./fixtures.js";

function expectCatalogError(
  operation: () => unknown,
  code: ConnectorCatalogError["code"]
): void {
  try {
    operation();
    throw new Error(`Expected ConnectorCatalogError ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(ConnectorCatalogError);
    expect((error as ConnectorCatalogError).code).toBe(code);
  }
}

describe("FileSystemConnectorCatalog", () => {
  it("lists connector directories in deterministic ID order", async () => {
    const fixture = await createCatalogFixture({
      zeta: await validConnectorManifest("zeta"),
      _template: await validConnectorManifest("template"),
      alpha: await validConnectorManifest("alpha")
    });

    try {
      const catalog = new FileSystemConnectorCatalog({ root: fixture.root });

      expect(catalog.list().map((record) => record.directoryId)).toEqual([
        "alpha",
        "zeta"
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("represents legacy manifests as non-selectable planning records", async () => {
    const fixture = await createCatalogFixture({
      motion: legacyConnectorManifest()
    });

    try {
      const catalog = new FileSystemConnectorCatalog({ root: fixture.root });
      const record = catalog.get("motion");

      expect(record).toEqual({
        kind: "legacy",
        directoryId: "motion",
        path: expect.stringContaining("sdk.manifest.json"),
        schemaVersion: "1.0.0",
        selectable: false
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("loads connector manifests lazily", async () => {
    const fixture = await createCatalogFixture({
      broken: "{ invalid json"
    });

    try {
      const catalog = new FileSystemConnectorCatalog({ root: fixture.root });

      expect(catalog.getCapabilityCatalog().capabilities.length).toBeGreaterThan(0);
      expectCatalogError(
        () => catalog.get("broken"),
        "CONNECTOR_MANIFEST_INVALID"
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("reports connector directories with a missing manifest", async () => {
    const fixture = await createCatalogFixture({ missing: null });

    try {
      const catalog = new FileSystemConnectorCatalog({ root: fixture.root });

      expectCatalogError(
        () => catalog.get("missing"),
        "CONNECTOR_MANIFEST_MISSING"
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("rejects duplicate v2 connector IDs", async () => {
    const fixture = await createCatalogFixture({
      alpha: await validConnectorManifest("shared"),
      beta: await validConnectorManifest("shared")
    });

    try {
      const catalog = new FileSystemConnectorCatalog({ root: fixture.root });

      expectCatalogError(
        () => catalog.list(),
        "CONNECTOR_DUPLICATE_ID"
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("returns undefined for an unknown directory ID", async () => {
    const fixture = await createCatalogFixture({
      alpha: await validConnectorManifest("alpha")
    });

    try {
      const catalog = new FileSystemConnectorCatalog({ root: fixture.root });

      expect(catalog.get("unknown")).toBeUndefined();
    } finally {
      await fixture.cleanup();
    }
  });
});
