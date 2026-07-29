import { describe, expect, it } from "vitest";

import { MemoryCatalogSnapshotStore } from "../src/index.js";
import { catalogSnapshotFixture } from "./fixtures.js";

describe("MemoryCatalogSnapshotStore", () => {
  it("round trips and replaces a snapshot with the same ID", async () => {
    const store = new MemoryCatalogSnapshotStore();
    const snapshot = await catalogSnapshotFixture(
      "alpha",
      "2026-07-28T00:00:00.000Z"
    );
    store.save(snapshot);
    expect(store.get(snapshot.snapshotId)).toEqual(snapshot);

    const replacement = {
      ...snapshot,
      createdAt: "2026-07-29T00:00:00.000Z"
    };
    store.save(replacement);
    expect(store.get(snapshot.snapshotId)?.createdAt).toBe(
      "2026-07-29T00:00:00.000Z"
    );
  });

  it("lists newest snapshots first and honors the limit", async () => {
    const store = new MemoryCatalogSnapshotStore();
    const older = await catalogSnapshotFixture(
      "older",
      "2026-07-27T00:00:00.000Z"
    );
    const newer = await catalogSnapshotFixture(
      "newer",
      "2026-07-28T00:00:00.000Z"
    );
    store.save(older);
    store.save(newer);
    expect(store.list().map((snapshot) => snapshot.snapshotId)).toEqual([
      newer.snapshotId,
      older.snapshotId
    ]);
    expect(store.list(1)).toEqual([newer]);
  });

  it("rejects invalid snapshots and operations after close", async () => {
    const store = new MemoryCatalogSnapshotStore();
    const snapshot = await catalogSnapshotFixture(
      "alpha",
      "2026-07-28T00:00:00.000Z"
    );
    expect(() => store.save({ ...snapshot, contractKind: "invalid" } as never)).toThrow(
      "Invalid catalog snapshot"
    );
    store.close();
    expect(() => store.list()).toThrow("closed");
    expect(() => store.save(snapshot)).toThrow("closed");
  });
});
