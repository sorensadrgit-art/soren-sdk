import type { CatalogSnapshot } from "@soren-sdk/contracts";

import type {
  CatalogReader,
  ConnectorHealthReport,
  ConnectorRecord
} from "./types.js";

export class CatalogService {
  constructor(private readonly reader: CatalogReader) {}

  listConnectors(): ConnectorRecord[] {
    return this.reader.list();
  }

  getConnector(connectorId: string): ConnectorRecord | undefined {
    return this.reader.get(connectorId);
  }

  getConnectorHealth(connectorId: string): ConnectorHealthReport {
    return this.reader.health(connectorId);
  }

  createSnapshot(createdAt?: string): CatalogSnapshot {
    return this.reader.snapshot(createdAt);
  }
}
