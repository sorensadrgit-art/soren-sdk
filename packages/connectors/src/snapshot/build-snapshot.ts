import {
  digestJson,
  validateContract,
  type CapabilityCatalog,
  type CatalogSnapshot,
  type JsonValue
} from "@soren-sdk/contracts";
import type { ConnectorRecord } from "@soren-sdk/core";

export interface BuildCatalogSnapshotInput {
  capabilityCatalog: CapabilityCatalog;
  connectors: ConnectorRecord[];
  createdAt: string;
}

function jsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

export function buildCatalogSnapshot(
  input: BuildCatalogSnapshotInput
): CatalogSnapshot {
  const capabilityCatalogDigest = digestJson(jsonValue(input.capabilityCatalog));
  const connectors = input.connectors
    .filter((record) => record.kind === "schema-v2")
    .map((record) => ({
      id: record.manifest.connector.id,
      connectorVersion: record.manifest.connectorVersion,
      digest: digestJson(jsonValue(record.manifest)),
      reviewStatus: record.manifest.connector.reviewStatus,
      selectable: record.manifest.connector.selectable
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const snapshotId = digestJson({
    capabilityCatalogDigest,
    connectors
  });

  const snapshot: CatalogSnapshot = {
    schemaVersion: "1.0.0-draft.1",
    contractKind: "catalog-snapshot",
    snapshotId,
    createdAt: input.createdAt,
    capabilityCatalogDigest,
    connectors
  };

  const validation = validateContract<CatalogSnapshot>(
    "catalog-snapshot",
    snapshot
  );
  if (!validation.ok) {
    throw new Error(
      `Generated catalog snapshot is invalid: ${validation.issues
        .map((issue) => `${issue.instancePath || "/"} ${issue.keyword}`)
        .join(", ")}`
    );
  }

  return validation.value;
}
