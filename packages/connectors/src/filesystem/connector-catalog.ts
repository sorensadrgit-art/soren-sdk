import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  validateCapabilityCatalog,
  validateConnectorManifest,
  type CapabilityCatalog,
  type CatalogSnapshot,
  type ConnectorManifest,
  type ContractIssue
} from "@soren-sdk/contracts";
import type {
  ConnectorHealthReport,
  ConnectorRecord
} from "@soren-sdk/core";

import { evaluateConnectorHealth } from "../health/evaluate-health.js";
import { buildCatalogSnapshot } from "../snapshot/build-snapshot.js";
import { ConnectorCatalogError } from "./errors.js";

export interface FileSystemConnectorCatalogOptions {
  root: string;
  expectedPublisher?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issueSummary(issues: readonly ContractIssue[]): string {
  return issues
    .map(
      (issue) =>
        `${issue.instancePath || "/"} ${issue.keyword}: ${issue.message}`
    )
    .join("; ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown filesystem error.";
}

function diagnosticHealth(
  connectorId: string,
  state: "invalid" | "missing",
  message: string
): ConnectorHealthReport {
  return {
    connectorId,
    state,
    selectable: false,
    reviewStatus: null,
    blockers: [],
    warnings: [],
    errors: [message]
  };
}

export class FileSystemConnectorCatalog {
  readonly #capabilityCatalog: CapabilityCatalog;
  readonly #connectorRoot: string;
  readonly #directoryIds: string[];
  readonly #expectedPublisher: string;
  readonly #records = new Map<string, ConnectorRecord>();

  constructor(options: FileSystemConnectorCatalogOptions) {
    const root = resolve(options.root);
    this.#connectorRoot = join(root, "sdk-connectors");
    this.#expectedPublisher = options.expectedPublisher ?? "soren-sdk";
    this.#capabilityCatalog = this.#loadCapabilityCatalog(
      join(root, "capabilities", "catalog.json")
    );
    this.#directoryIds = readdirSync(this.#connectorRoot, {
      withFileTypes: true
    })
      .filter(
        (entry) => entry.isDirectory() && !entry.name.startsWith("_")
      )
      .map((entry) => entry.name)
      .sort();
  }

  getCapabilityCatalog(): CapabilityCatalog {
    return this.#capabilityCatalog;
  }

  list(): ConnectorRecord[] {
    const records = this.#directoryIds.map((directoryId) =>
      this.#loadRecord(directoryId)
    );
    this.#assertUniqueConnectorIds(records);
    return records;
  }

  get(connectorId: string): ConnectorRecord | undefined {
    if (this.#directoryIds.includes(connectorId)) {
      return this.#loadRecord(connectorId);
    }
    return this.list().find(
      (record) =>
        record.kind === "schema-v2" &&
        record.manifest.connector.id === connectorId
    );
  }

  health(connectorId: string): ConnectorHealthReport {
    if (!this.#directoryIds.includes(connectorId)) {
      const matchingDirectory = this.#directoryIds.find((directoryId) => {
        try {
          const record = this.#loadRecord(directoryId);
          return (
            record.kind === "schema-v2" &&
            record.manifest.connector.id === connectorId
          );
        } catch {
          return false;
        }
      });
      if (matchingDirectory === undefined) {
        return diagnosticHealth(
          connectorId,
          "missing",
          `Connector "${connectorId}" was not found.`
        );
      }
      connectorId = matchingDirectory;
    }

    try {
      const record = this.#loadRecord(connectorId);
      return evaluateConnectorHealth(record, {
        now: new Date(),
        connectorDirectory: dirname(record.path)
      });
    } catch (error) {
      if (error instanceof ConnectorCatalogError) {
        return diagnosticHealth(
          connectorId,
          error.code === "CONNECTOR_MANIFEST_MISSING" ? "missing" : "invalid",
          error.message
        );
      }
      return diagnosticHealth(connectorId, "invalid", errorMessage(error));
    }
  }

  snapshot(createdAt = new Date().toISOString()): CatalogSnapshot {
    return buildCatalogSnapshot({
      capabilityCatalog: this.#capabilityCatalog,
      connectors: this.list(),
      createdAt
    });
  }

  #loadCapabilityCatalog(path: string): CapabilityCatalog {
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    } catch (error) {
      throw new ConnectorCatalogError(
        "CAPABILITY_CATALOG_INVALID",
        `Unable to read capability catalog: ${errorMessage(error)}`,
        path
      );
    }

    const result = validateCapabilityCatalog(value);
    if (!result.ok) {
      throw new ConnectorCatalogError(
        "CAPABILITY_CATALOG_INVALID",
        `Capability catalog is invalid: ${issueSummary(result.issues)}`,
        path
      );
    }
    return result.value;
  }

  #loadRecord(directoryId: string): ConnectorRecord {
    const cached = this.#records.get(directoryId);
    if (cached !== undefined) {
      return cached;
    }

    const path = join(
      this.#connectorRoot,
      directoryId,
      "sdk.manifest.json"
    );
    let source: string;
    try {
      source = readFileSync(path, "utf8");
    } catch (error) {
      const code =
        isRecord(error) && error.code === "ENOENT"
          ? "CONNECTOR_MANIFEST_MISSING"
          : "CONNECTOR_MANIFEST_UNREADABLE";
      throw new ConnectorCatalogError(
        code,
        code === "CONNECTOR_MANIFEST_MISSING"
          ? `Connector manifest is missing for "${directoryId}".`
          : `Unable to read connector manifest for "${directoryId}": ${errorMessage(error)}`,
        path
      );
    }

    let value: unknown;
    try {
      value = JSON.parse(source) as unknown;
    } catch (error) {
      throw new ConnectorCatalogError(
        "CONNECTOR_MANIFEST_INVALID",
        `Connector manifest is not valid JSON: ${errorMessage(error)}`,
        path
      );
    }

    const schemaVersion =
      isRecord(value) && typeof value.schemaVersion === "string"
        ? value.schemaVersion
        : null;

    if (schemaVersion !== "2.0.0-draft.1") {
      if (schemaVersion === null) {
        throw new ConnectorCatalogError(
          "CONNECTOR_MANIFEST_INVALID",
          "Connector manifest does not declare a schemaVersion.",
          path
        );
      }
      const legacyRecord: ConnectorRecord = {
        kind: "legacy",
        directoryId,
        path,
        schemaVersion,
        selectable: false
      };
      this.#records.set(directoryId, legacyRecord);
      return legacyRecord;
    }

    const result = validateConnectorManifest(value, {
      expectedPublisher: this.#expectedPublisher,
      capabilityCatalog: this.#capabilityCatalog
    });
    if (!result.ok) {
      throw new ConnectorCatalogError(
        "CONNECTOR_MANIFEST_INVALID",
        `Connector manifest is invalid: ${issueSummary(result.issues)}`,
        path
      );
    }

    const record: ConnectorRecord = {
      kind: "schema-v2",
      directoryId,
      path,
      manifest: result.value as ConnectorManifest,
      selectable: result.value.connector.selectable
    };
    this.#records.set(directoryId, record);
    return record;
  }

  #assertUniqueConnectorIds(records: readonly ConnectorRecord[]): void {
    const seen = new Map<string, string>();
    for (const record of records) {
      if (record.kind !== "schema-v2") {
        continue;
      }
      const connectorId = record.manifest.connector.id;
      const previousDirectory = seen.get(connectorId);
      if (previousDirectory !== undefined) {
        throw new ConnectorCatalogError(
          "CONNECTOR_DUPLICATE_ID",
          `Connector ID "${connectorId}" is declared by both "${previousDirectory}" and "${record.directoryId}".`,
          record.path
        );
      }
      seen.set(connectorId, record.directoryId);
    }
  }
}
