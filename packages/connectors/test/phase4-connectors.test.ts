import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ConnectorManifest } from "@soren-sdk/contracts";

import { FileSystemConnectorCatalog } from "../src/index.js";
import { repositoryRoot } from "./fixtures.js";

const EXPECTED_RUNTIME = {
  "web-platform": {
    integrationId: "web-platform-built-in",
    version: null,
    license: "not-applicable"
  },
  motion: {
    integrationId: "motion-runtime",
    version: "12.42.2",
    license: "MIT"
  },
  gsap: {
    integrationId: "gsap-runtime",
    version: "3.15.0",
    license: "LicenseRef-GSAP-Standard"
  }
} as const;

function runtimeIntegration(manifest: ConnectorManifest, integrationId: string) {
  return manifest.integrations.find((integration) => integration.id === integrationId);
}

describe("Phase 4 connector readiness", () => {
  for (const connectorId of ["web-platform", "motion", "gsap"] as const) {
    it(`${connectorId} is healthy, approved, selectable, and file-complete`, () => {
      const catalog = new FileSystemConnectorCatalog({ root: repositoryRoot() });
      const record = catalog.get(connectorId);

      expect(record?.kind).toBe("schema-v2");
      if (record?.kind !== "schema-v2") {
        throw new Error(`Expected ${connectorId} to use Connector Manifest v2.`);
      }

      expect(record.manifest.connector).toMatchObject({
        id: connectorId,
        reviewStatus: "approved",
        selectable: true,
        blockers: []
      });
      expect(catalog.health(connectorId)).toMatchObject({
        connectorId,
        state: "healthy",
        selectable: true,
        blockers: [],
        errors: []
      });

      const connectorDirectory = dirname(record.path);
      for (const related of Object.values(record.manifest.relatedFiles)) {
        expect(related.status).toBe("present");
        expect(existsSync(join(connectorDirectory, related.path))).toBe(true);
      }

      for (const file of ["docs.sources.json", "compatibility.json", "evaluations/route-cases.json"]) {
        expect(() => JSON.parse(readFileSync(join(connectorDirectory, file), "utf8"))).not.toThrow();
      }

      const expected = EXPECTED_RUNTIME[connectorId];
      const runtime = runtimeIntegration(record.manifest, expected.integrationId);
      expect(runtime).toBeDefined();
      expect(runtime?.licenseExpression).toBe(expected.license);
      if (expected.version === null) {
        expect(runtime?.version.status).toBe("not-applicable");
      } else {
        expect(runtime?.version).toMatchObject({
          status: "resolved",
          value: expected.version
        });
      }
    });
  }
});
