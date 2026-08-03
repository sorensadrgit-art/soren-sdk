import {
  canonicalJson,
  type JsonValue,
  type ProjectSnapshot,
  type SorenSdkLock
} from "@soren-sdk/contracts";
import type {
  LoadedConfiguration,
  LockDriftReport,
  ResolvedPolicy
} from "@soren-sdk/config";
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

export function formatLoadedConfig(loaded: LoadedConfiguration): string {
  const preferences = loaded.config.preferences;
  const lines = [
    `Config: ${loaded.config.configId}`,
    `digest: ${loaded.digest}`,
    `source: ${loaded.source.format} ${loaded.source.path}`,
    `preferredProviders: ${(preferences?.preferredProviders ?? []).join(", ") || "none"}`,
    `forbiddenProviders: ${(preferences?.forbiddenProviders ?? []).join(", ") || "none"}`,
    `maxProviders: ${preferences?.maxProviders ?? "unset"}`
  ];
  return `${lines.join("\n")}\n`;
}

export function formatResolvedPolicy(policy: ResolvedPolicy): string {
  const effective = policy.effective;
  const lines = [
    `Resolved policy: ${policy.snapshotId}`,
    `policyId: ${policy.document.policyId}`,
    `layers: ${policy.layers
      .map((layer) => `${layer.scope}:${layer.policyId ?? "builtin"}`)
      .join(" -> ")}`,
    `allowedConnectors: ${effective.allowedConnectors.join(", ") || "none"}`,
    `deniedConnectors: ${effective.deniedConnectors.join(", ") || "none"}`,
    `allowedLicenses: ${effective.allowedLicenses.join(", ") || "none"}`,
    `allowExperimental: ${String(effective.allowExperimental)}`,
    `allowPaidServices: ${String(effective.allowPaidServices)}`,
    `allowRemoteProjectContent: ${String(effective.allowRemoteProjectContent)}`,
    `network: ${effective.network.mode}${
      effective.network.allowedHosts.length > 0
        ? ` (${effective.network.allowedHosts.join(", ")})`
        : ""
    }`,
    `filesystem.read: ${effective.filesystem.read.join(", ") || "none"}`,
    `filesystem.write: ${effective.filesystem.write.join(", ") || "none"}`,
    `maxBundleKilobytes: ${effective.maxBundleKilobytes ?? "unset"}`,
    `requireReducedMotion: ${String(effective.requireReducedMotion)}`,
    `requiredApprovals: ${effective.requiredApprovals.join(", ") || "none"}`,
    `decisions: ${policy.decisions.length}`
  ];
  return `${lines.join("\n")}\n`;
}

export function formatLock(lock: SorenSdkLock): string {
  const lines = [
    `Soren SDK lock: ${lock.digest}`,
    `generatedAt: ${lock.generatedAt}`,
    `capability ontology: ${lock.capabilityOntologyVersion}`,
    `project snapshot: ${lock.projectSnapshotDigest}`,
    `catalog snapshot: ${lock.catalogSnapshotDigest}`,
    `policy snapshot: ${lock.policySnapshotDigest}`,
    `config: ${lock.configDigest}`,
    `route plan: ${lock.routePlanId} (${lock.routePlanDigest})`,
    `connectors: ${lock.connectors.length}`,
    `unavailable: ${
      lock.unavailable
        .map((entry) => `${entry.id} (${entry.reasonCode})`)
        .join(", ") || "none"
    }`
  ];
  return `${lines.join("\n")}\n`;
}

export function formatDrift(report: LockDriftReport): string {
  const lines = [
    report.inSync ? "Lock is in sync." : "Lock is out of sync."
  ];
  for (const drift of report.drifts) {
    lines.push(
      `${drift.severity}\t${drift.field}\tlocked=${drift.locked ?? "(none)"}\tcurrent=${drift.current ?? "(none)"}`
    );
  }
  return `${lines.join("\n")}\n`;
}
