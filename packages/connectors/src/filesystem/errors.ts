export type ConnectorCatalogErrorCode =
  | "CAPABILITY_CATALOG_INVALID"
  | "CONNECTOR_DUPLICATE_ID"
  | "CONNECTOR_MANIFEST_INVALID"
  | "CONNECTOR_MANIFEST_MISSING"
  | "CONNECTOR_MANIFEST_UNREADABLE";

export class ConnectorCatalogError extends Error {
  override readonly name = "ConnectorCatalogError";

  constructor(
    readonly code: ConnectorCatalogErrorCode,
    message: string,
    readonly path?: string
  ) {
    super(message);
  }
}
