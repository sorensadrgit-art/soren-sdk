import {
  canonicalJson,
  type JsonValue,
  type ProjectSnapshot
} from "@soren-sdk/contracts";
import type {
  ConnectorHealthReport,
  ConnectorRecord
} from "@soren-sdk/core";

function asJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export function formatJson(value: unknown): string {
  return `${canonicalJson(asJsonValue(value))}\n`;
}

export function connectorId(record: ConnectorRecord): string {
  return record.kind === "schema-v2"
    ? record.manifest.connector.id
    : record.directoryId;
}

export function formatConnectorLine(record: ConnectorRecord): string {
  return `${connectorId(record)}\t${record.kind}\t${String(record.selectable)}`;
}

export function formatConnector(record: ConnectorRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function formatHealth(report: ConnectorHealthReport): string {
  const lines = [
    `${report.connectorId}\t${report.state}\t${String(report.selectable)}`,
    `reviewStatus: ${report.reviewStatus ?? "none"}`
  ];
  for (const blocker of report.blockers) lines.push(`blocker: ${blocker}`);
  for (const warning of report.warnings) lines.push(`warning: ${warning}`);
  for (const error of report.errors) lines.push(`error: ${error}`);
  return `${lines.join("\n")}\n`;
}

export function formatProjectSnapshot(snapshot: ProjectSnapshot): string {
  const frameworks = snapshot.frameworks
    .map((item) => `${item.name}@${item.version ?? "unknown"} (${item.workspace})`)
    .join(", ");
  const lines = [
    `Project snapshot: ${snapshot.snapshotId}`,
    `root: ${snapshot.root}`,
    `revision: ${snapshot.revision.vcs} ${snapshot.revision.commit ?? "unknown"}`,
    `package manager: ${snapshot.packageManager.name}@${snapshot.packageManager.version ?? "unknown"}`,
    `workspaces: ${snapshot.workspace.packages.length}`,
    `frameworks: ${frameworks || "none"}`,
    `dependencies: ${snapshot.dependencies.length}`,
    `configurations: ${snapshot.configurations.length}`,
    `policies: ${snapshot.policies.length}`,
    `browser targets: ${snapshot.targets.browsers.join(", ") || "none"}`,
    `runtime targets: ${snapshot.targets.runtimes.join(", ") || "none"}`
  ];
  for (const warning of snapshot.warnings) lines.push(`warning: ${warning}`);
  return `${lines.join("\n")}\n`;
}
