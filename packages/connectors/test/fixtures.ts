import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  CatalogSnapshot,
  ConnectorManifest
} from "@soren-sdk/contracts";
import type { ConnectorRecord } from "@soren-sdk/core";
import { buildCatalogSnapshot } from "../src/snapshot/build-snapshot.js";

export type ManifestFixture = ConnectorManifest | Record<string, unknown> | string | null;

export function repositoryRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export async function validConnectorManifest(
  connectorId: string
): Promise<ConnectorManifest> {
  const source = await readFile(
    join(
      repositoryRoot(),
      "sdk-connectors",
      "web-platform",
      "sdk.manifest.json"
    ),
    "utf8"
  );
  const manifest = JSON.parse(source) as ConnectorManifest;
  manifest.connector.id = connectorId;
  manifest.connector.name = `${connectorId} connector`;
  manifest.product.canonicalName = connectorId;
  return manifest;
}

export function legacyConnectorManifest(): Record<string, unknown> {
  return {
    schemaVersion: "1.0.0",
    connectorVersion: "0.1.0",
    id: "legacy-motion",
    name: "Legacy Motion planning connector"
  };
}

export async function catalogSnapshotFixture(
  connectorId: string,
  createdAt: string
): Promise<CatalogSnapshot> {
  const manifest = await validConnectorManifest(connectorId);
  const record: ConnectorRecord = {
    kind: "schema-v2",
    directoryId: connectorId,
    path: `/tmp/${connectorId}/sdk.manifest.json`,
    manifest,
    selectable: manifest.connector.selectable
  };
  const catalog = JSON.parse(
    await readFile(join(repositoryRoot(), "capabilities", "catalog.json"), "utf8")
  );
  return buildCatalogSnapshot({
    capabilityCatalog: catalog,
    connectors: [record],
    createdAt
  });
}

export async function createCatalogFixture(
  manifests: Record<string, ManifestFixture>
): Promise<{ cleanup(): Promise<void>; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "soren-sdk-catalog-"));
  await mkdir(join(root, "capabilities"), { recursive: true });
  await mkdir(join(root, "sdk-connectors"), { recursive: true });

  const capabilityCatalog = await readFile(
    join(repositoryRoot(), "capabilities", "catalog.json"),
    "utf8"
  );
  await writeFile(
    join(root, "capabilities", "catalog.json"),
    capabilityCatalog,
    "utf8"
  );

  for (const [directoryId, manifest] of Object.entries(manifests)) {
    const directory = join(root, "sdk-connectors", directoryId);
    await mkdir(directory, { recursive: true });
    if (manifest === null) {
      continue;
    }
    await writeFile(
      join(directory, "sdk.manifest.json"),
      typeof manifest === "string" ? manifest : JSON.stringify(manifest, null, 2),
      "utf8"
    );
  }

  return {
    root,
    async cleanup(): Promise<void> {
      await rm(root, { recursive: true, force: true });
    }
  };
}
