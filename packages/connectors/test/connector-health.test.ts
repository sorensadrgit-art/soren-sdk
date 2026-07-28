import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { SchemaV2ConnectorRecord } from "@soren-sdk/core";
import {
  FileSystemConnectorCatalog,
  evaluateConnectorHealth
} from "../src/index.js";
import {
  createCatalogFixture,
  legacyConnectorManifest,
  validConnectorManifest
} from "./fixtures.js";

describe("connector health", () => {
  it("reports legacy connectors as legacy and non-selectable", async () => {
    const fixture = await createCatalogFixture({
      legacy: legacyConnectorManifest()
    });
    try {
      const report = new FileSystemConnectorCatalog({ root: fixture.root }).health(
        "legacy"
      );
      expect(report.state).toBe("legacy");
      expect(report.selectable).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("reports connector blockers as blocked", async () => {
    const manifest = await validConnectorManifest("blocked");
    manifest.connector.blockers = ["Needs approval"];
    const fixture = await createCatalogFixture({ blocked: manifest });
    try {
      const report = new FileSystemConnectorCatalog({ root: fixture.root }).health(
        "blocked"
      );
      expect(report.state).toBe("blocked");
      expect(report.blockers).toEqual(["Needs approval"]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("reports stale knowledge and unresolved available artifacts", async () => {
    const manifest = await validConnectorManifest("stale");
    manifest.connector.reviewStatus = "approved";
    manifest.connector.selectable = true;
    manifest.connector.blockers = [];
    manifest.knowledge.retrievedAt = "2020-01-01";
    manifest.knowledge.staleAfterDays = 1;
    manifest.integrations[0]!.version.status = "unresolved";
    const record: SchemaV2ConnectorRecord = {
      kind: "schema-v2",
      directoryId: "stale",
      path: "/tmp/stale/sdk.manifest.json",
      manifest,
      selectable: true
    };

    const report = evaluateConnectorHealth(record, {
      now: new Date("2026-07-28T00:00:00.000Z"),
      connectorDirectory: "/tmp/stale"
    });
    expect(report.warnings[0]).toContain("Knowledge is stale");
    expect(report.errors.some((value) => value.includes("unresolved"))).toBe(
      true
    );
  });

  it("reports missing related files marked present", async () => {
    const manifest = await validConnectorManifest("missing-file");
    manifest.connector.reviewStatus = "approved";
    manifest.connector.selectable = true;
    manifest.connector.blockers = [];
    manifest.relatedFiles.skill = {
      path: "./SKILL.md",
      status: "present"
    };
    const fixture = await createCatalogFixture({ "missing-file": manifest });
    try {
      const report = new FileSystemConnectorCatalog({ root: fixture.root }).health(
        "missing-file"
      );
      expect(report.state).toBe("blocked");
      expect(report.errors).toContain(
        'Related file "skill" is marked present but is missing.'
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("reports a clean approved connector as healthy", async () => {
    const manifest = await validConnectorManifest("healthy");
    manifest.connector.reviewStatus = "approved";
    manifest.connector.selectable = true;
    manifest.connector.blockers = [];
    manifest.knowledge.retrievedAt = "2026-07-28";
    manifest.knowledge.staleAfterDays = 365;
    const fixture = await createCatalogFixture({ healthy: manifest });
    await mkdir(join(fixture.root, "sdk-connectors", "healthy"), {
      recursive: true
    });
    await writeFile(
      join(fixture.root, "sdk-connectors", "healthy", "SKILL.md"),
      "# Healthy\n",
      "utf8"
    );
    try {
      const report = new FileSystemConnectorCatalog({ root: fixture.root }).health(
        "healthy"
      );
      expect(report.state).toBe("healthy");
      expect(report.errors).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });
});
