import { join } from "node:path";

import {
  validateContract,
  type ProjectSnapshot
} from "@soren-sdk/contracts";

import {
  readPackageManifest,
  resolveProjectRoot
} from "./filesystem.js";
import { detectRevision } from "./git.js";
import { detectPackageManager } from "./package-manager.js";
import {
  collectDependencies,
  detectConfigurations,
  detectFrameworks,
  detectPolicies,
  detectRuntimes,
  detectTargets
} from "./detect.js";
import {
  ProjectInspectionError,
  type InspectProjectOptions
} from "./types.js";
import { projectSnapshotDigest } from "./project-snapshot-digest.js";
import { detectWorkspaces } from "./workspaces.js";

function stableWarnings(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

export function inspectProject(options: InspectProjectOptions): ProjectSnapshot {
  const root = resolveProjectRoot(options.root);
  const rootManifest = readPackageManifest(join(root, "package.json"));
  const manager = detectPackageManager(root, rootManifest);
  const workspace = detectWorkspaces(root, rootManifest);
  const revision = detectRevision(root);
  const dependencies = collectDependencies(workspace.packages);
  const frameworks = detectFrameworks(dependencies);
  const runtimes = detectRuntimes(workspace.packages);
  const configurations = detectConfigurations(root, workspace.packages);
  const policies = detectPolicies(root);
  const targets = detectTargets(root, workspace.packages, runtimes);
  const warnings = stableWarnings([
    ...manager.warnings,
    ...workspace.warnings,
    ...revision.warnings
  ]);

  const digestPayload = {
    revision: revision.revision,
    packageManager: manager.packageManager,
    workspace: {
      isMonorepo: workspace.isMonorepo,
      packages: workspace.packages.map(({ name, path, private: isPrivate }) => ({
        name,
        path,
        private: isPrivate
      }))
    },
    runtimes,
    frameworks,
    dependencies,
    configurations,
    policies,
    targets,
    warnings
  };

  const snapshot: ProjectSnapshot = {
    schemaVersion: "1.0.0-draft.1",
    contractKind: "project-snapshot",
    snapshotId: projectSnapshotDigest(digestPayload),
    createdAt: options.createdAt ?? new Date().toISOString(),
    root,
    ...digestPayload
  };

  const validation = validateContract<ProjectSnapshot>("project-snapshot", snapshot);
  if (!validation.ok) {
    throw new ProjectInspectionError(
      "PROJECT_SNAPSHOT_INVALID",
      `Generated project snapshot is invalid: ${validation.issues
        .map(
          (issue) =>
            `${issue.instancePath || "/"} ${issue.keyword}: ${issue.message}`
        )
        .join("; ")}`,
      root
    );
  }
  return validation.value;
}
