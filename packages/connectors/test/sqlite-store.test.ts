import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { SqliteCatalogSnapshotStore } from "../src/index.js";
import { catalogSnapshotFixture } from "./fixtures.js";

describe("SqliteCatalogSnapshotStore", () => {
  it("persists, reopens, and lists snapshots newest first", async () => {
    const directory = await mkdtemp(join(tmpdir(), "soren-sdk-sqlite-"));
    const databasePath = join(directory, "catalog.sqlite");
    try {
      const older = await catalogSnapshotFixture(
        "older",
        "2026-07-27T00:00:00.000Z"
      );
      const newer = await catalogSnapshotFixture(
        "newer",
        "2026-07-28T00:00:00.000Z"
      );
      const first = new SqliteCatalogSnapshotStore(databasePath);
      first.save(older);
      first.save(newer);
      first.close();

      const reopened = new SqliteCatalogSnapshotStore(databasePath);
      expect(reopened.get(older.snapshotId)).toEqual(older);
      expect(reopened.list().map((snapshot) => snapshot.snapshotId)).toEqual([
        newer.snapshotId,
        older.snapshotId
      ]);
      reopened.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects a stored snapshot after its integrity digest is tampered", async () => {
    const directory = await mkdtemp(join(tmpdir(), "soren-sdk-sqlite-"));
    const databasePath = join(directory, "catalog.sqlite");
    try {
      const snapshot = await catalogSnapshotFixture(
        "tampered",
        "2026-07-28T00:00:00.000Z"
      );
      const store = new SqliteCatalogSnapshotStore(databasePath);
      store.save(snapshot);
      store.close();

      const database = new DatabaseSync(databasePath);
      database
        .prepare(
          "UPDATE catalog_snapshots SET content_digest = ? WHERE snapshot_id = ?"
        )
        .run(`sha256:${"0".repeat(64)}`, snapshot.snapshotId);
      database.close();

      const reopened = new SqliteCatalogSnapshotStore(databasePath);
      try {
        expect(() => reopened.get(snapshot.snapshotId)).toThrow(
          "integrity check"
        );
      } finally {
        reopened.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("throws after close instead of reopening implicitly", async () => {
    const directory = await mkdtemp(join(tmpdir(), "soren-sdk-sqlite-"));
    const databasePath = join(directory, "catalog.sqlite");
    try {
      const store = new SqliteCatalogSnapshotStore(databasePath);
      store.close();
      expect(() => store.list()).toThrow("closed");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
