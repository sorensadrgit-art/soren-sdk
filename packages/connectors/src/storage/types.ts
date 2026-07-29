import {
  validateContract,
  type CatalogSnapshot
} from "@soren-sdk/contracts";

export interface CatalogSnapshotStore {
  save(snapshot: CatalogSnapshot): void;
  get(snapshotId: string): CatalogSnapshot | undefined;
  list(limit?: number): CatalogSnapshot[];
  close(): void;
}

export function assertCatalogSnapshot(value: unknown): CatalogSnapshot {
  const result = validateContract<CatalogSnapshot>("catalog-snapshot", value);
  if (!result.ok) {
    throw new TypeError(
      `Invalid catalog snapshot: ${result.issues
        .map(
          (issue) =>
            `${issue.instancePath || "/"} ${issue.keyword}: ${issue.message}`
        )
        .join("; ")}`
    );
  }
  return result.value;
}
