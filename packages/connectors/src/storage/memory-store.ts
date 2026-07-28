import {
  canonicalJson,
  type CatalogSnapshot
} from "@soren-sdk/contracts";

import {
  assertCatalogSnapshot,
  type CatalogSnapshotStore
} from "./types.js";

function cloneSnapshot(snapshot: CatalogSnapshot): CatalogSnapshot {
  return assertCatalogSnapshot(JSON.parse(canonicalJson(snapshot)) as unknown);
}

export class MemoryCatalogSnapshotStore implements CatalogSnapshotStore {
  readonly #snapshots = new Map<string, CatalogSnapshot>();
  #closed = false;

  save(snapshot: CatalogSnapshot): void {
    this.#assertOpen();
    const validated = cloneSnapshot(snapshot);
    this.#snapshots.set(validated.snapshotId, validated);
  }

  get(snapshotId: string): CatalogSnapshot | undefined {
    this.#assertOpen();
    const snapshot = this.#snapshots.get(snapshotId);
    return snapshot === undefined ? undefined : cloneSnapshot(snapshot);
  }

  list(limit = Number.POSITIVE_INFINITY): CatalogSnapshot[] {
    this.#assertOpen();
    if (limit < 0 || Number.isNaN(limit)) {
      throw new RangeError("Snapshot list limit must be non-negative.");
    }
    return [...this.#snapshots.values()]
      .sort((left, right) => {
        const byCreated = right.createdAt.localeCompare(left.createdAt);
        return byCreated !== 0
          ? byCreated
          : left.snapshotId.localeCompare(right.snapshotId);
      })
      .slice(0, limit)
      .map(cloneSnapshot);
  }

  close(): void {
    if (this.#closed) return;
    this.#snapshots.clear();
    this.#closed = true;
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new Error("Catalog snapshot store is closed.");
    }
  }
}
