import type {
  CapabilityCatalog,
  CatalogSnapshot,
  ConnectorManifest
} from "@soren-sdk/contracts";

export interface LegacyConnectorRecord {
  kind: "legacy";
  directoryId: string;
  path: string;
  schemaVersion: string | null;
  selectable: false;
}

export interface SchemaV2ConnectorRecord {
  kind: "schema-v2";
  directoryId: string;
  path: string;
  manifest: ConnectorManifest;
  selectable: boolean;
}

export type ConnectorRecord = LegacyConnectorRecord | SchemaV2ConnectorRecord;

export type ConnectorHealthState =
  | "blocked"
  | "healthy"
  | "invalid"
  | "legacy"
  | "missing";

export interface ConnectorHealthReport {
  connectorId: string;
  state: ConnectorHealthState;
  selectable: boolean;
  reviewStatus: string | null;
  blockers: string[];
  warnings: string[];
  errors: string[];
}

export interface CatalogReader {
  getCapabilityCatalog(): CapabilityCatalog;
  list(): ConnectorRecord[];
  get(connectorId: string): ConnectorRecord | undefined;
  health(connectorId: string): ConnectorHealthReport;
  snapshot(createdAt?: string): CatalogSnapshot;
}
