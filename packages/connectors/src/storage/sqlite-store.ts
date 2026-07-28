import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import {
  canonicalJson,
  digestJson,
  type CatalogSnapshot
} from "@soren-sdk/contracts";

import {
  assertCatalogSnapshot,
  type CatalogSnapshotStore
} from "./types.js";

interface SnapshotRow {
  snapshot_id: string;
  created_at: string;
  canonical_json: string;
  content_digest: string;
}

function isSnapshotRow(value: unknown): value is SnapshotRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "snapshot_id" in value &&
    "created_at" in value &&
    "canonical_json" in value &&
    "content_digest" in value &&
    typeof value.snapshot_id === "string" &&
    typeof value.created_at === "string" &&
    typeof value.canonical_json === "string" &&
    typeof value.content_digest === "string"
  );
}

export class SqliteCatalogSnapshotStore implements CatalogSnapshotStore {
  readonly #database: DatabaseSync;
  #closed = false;

  constructor(path: string | URL) {
    this.#database = new DatabaseSync(
      path instanceof URL ? fileURLToPath(path) : path
    );
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS catalog_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        canonical_json TEXT NOT NULL,
        content_digest TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS catalog_snapshots_created_at
      ON catalog_snapshots(created_at DESC, snapshot_id ASC);
    `);
  }

  save(snapshot: CatalogSnapshot): void {
    this.#assertOpen();
    const validated = assertCatalogSnapshot(snapshot);
    const source = canonicalJson(validated);
    const digest = digestJson(validated);
    this.#database
      .prepare(`
        INSERT INTO catalog_snapshots (
          snapshot_id,
          created_at,
          canonical_json,
          content_digest
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(snapshot_id) DO UPDATE SET
          created_at = excluded.created_at,
          canonical_json = excluded.canonical_json,
          content_digest = excluded.content_digest
      `)
      .run(validated.snapshotId, validated.createdAt, source, digest);
  }

  get(snapshotId: string): CatalogSnapshot | undefined {
    this.#assertOpen();
    const row = this.#database
      .prepare(`
        SELECT snapshot_id, created_at, canonical_json, content_digest
        FROM catalog_snapshots
        WHERE snapshot_id = ?
      `)
      .get(snapshotId);
    return row === undefined ? undefined : this.#decodeRow(row);
  }

  list(limit = 100): CatalogSnapshot[] {
    this.#assertOpen();
    if (!Number.isInteger(limit) || limit < 0) {
      throw new RangeError("Snapshot list limit must be a non-negative integer.");
    }
    const rows = this.#database
      .prepare(`
        SELECT snapshot_id, created_at, canonical_json, content_digest
        FROM catalog_snapshots
        ORDER BY created_at DESC, snapshot_id ASC
        LIMIT ?
      `)
      .all(limit);
    return rows.map((row) => this.#decodeRow(row));
  }

  close(): void {
    if (this.#closed) return;
    this.#database.close();
    this.#closed = true;
  }

  #decodeRow(value: unknown): CatalogSnapshot {
    if (!isSnapshotRow(value)) {
      throw new Error("Stored catalog snapshot row is malformed.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(value.canonical_json) as unknown;
    } catch (error) {
      throw new Error(
        `Stored catalog snapshot JSON is malformed: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
    const snapshot = assertCatalogSnapshot(parsed);
    if (snapshot.snapshotId !== value.snapshot_id) {
      throw new Error("Stored catalog snapshot ID does not match its payload.");
    }
    if (digestJson(snapshot) !== value.content_digest) {
      throw new Error("Stored catalog snapshot failed its integrity check.");
    }
    return snapshot;
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new Error("Catalog snapshot store is closed.");
    }
  }
}
