import { existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import type {
  ConnectorHealthReport,
  ConnectorRecord
} from "@soren-sdk/core";

export interface HealthEvaluationContext {
  now: Date;
  connectorDirectory?: string;
}

const EXECUTABLE_ARTIFACTS = new Set([
  "agent-skill",
  "mcp-server",
  "runtime-package"
]);

function isPathInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !path.startsWith("/"));
}

function stable(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

export function evaluateConnectorHealth(
  record: ConnectorRecord,
  context: HealthEvaluationContext
): ConnectorHealthReport {
  if (record.kind === "legacy") {
    return {
      connectorId: record.directoryId,
      state: "legacy",
      selectable: false,
      reviewStatus: null,
      blockers: [],
      warnings: [
        `Legacy connector schema ${record.schemaVersion ?? "unknown"} is visible but never selectable.`
      ],
      errors: []
    };
  }

  const { manifest } = record;
  const blockers = [...manifest.connector.blockers];
  const warnings: string[] = [];
  const errors: string[] = [];

  const retrievedAt = Date.parse(`${manifest.knowledge.retrievedAt}T00:00:00.000Z`);
  const staleAt =
    retrievedAt + manifest.knowledge.staleAfterDays * 24 * 60 * 60 * 1000;
  if (Number.isFinite(staleAt) && context.now.getTime() > staleAt) {
    warnings.push(
      `Knowledge is stale: retrieved ${manifest.knowledge.retrievedAt}, freshness window ${manifest.knowledge.staleAfterDays} day(s).`
    );
  }

  if (!["approved", "stable"].includes(manifest.connector.reviewStatus)) {
    errors.push(
      `Connector review status "${manifest.connector.reviewStatus}" is not selectable.`
    );
  }

  if (!manifest.connector.selectable) {
    errors.push("Connector is marked non-selectable.");
  }

  for (const integration of manifest.integrations) {
    if (
      integration.status === "available" &&
      integration.version.status === "unresolved"
    ) {
      errors.push(
        `Integration "${integration.id}" has an unresolved available version.`
      );
    }

    if (
      integration.status === "available" &&
      EXECUTABLE_ARTIFACTS.has(integration.kind) &&
      (integration.licenseExpression === undefined ||
        integration.licenseExpression === "NOASSERTION")
    ) {
      errors.push(
        `Integration "${integration.id}" has unresolved license metadata.`
      );
    }
  }

  const connectorDirectory =
    context.connectorDirectory ?? dirname(record.path);
  for (const [name, related] of Object.entries(manifest.relatedFiles)) {
    if (related.status !== "present") continue;
    const candidate = resolve(connectorDirectory, related.path);
    if (!isPathInside(connectorDirectory, candidate)) {
      errors.push(`Related file "${name}" escapes the connector directory.`);
      continue;
    }
    if (!existsSync(candidate)) {
      errors.push(`Related file "${name}" is marked present but is missing.`);
    }
  }

  const stableBlockers = stable(blockers);
  const stableWarnings = stable(warnings);
  const stableErrors = stable(errors);

  return {
    connectorId: manifest.connector.id,
    state:
      stableBlockers.length > 0 || stableErrors.length > 0
        ? "blocked"
        : "healthy",
    selectable: manifest.connector.selectable,
    reviewStatus: manifest.connector.reviewStatus,
    blockers: stableBlockers,
    warnings: stableWarnings,
    errors: stableErrors
  };
}
