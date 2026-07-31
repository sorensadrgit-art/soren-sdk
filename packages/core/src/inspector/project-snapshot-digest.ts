import {
  digestJson,
  type Digest,
  type JsonValue,
  type ProjectSnapshot
} from "@soren-sdk/contracts";

export type ProjectSnapshotDigestSource = Pick<
  ProjectSnapshot,
  | "revision"
  | "packageManager"
  | "workspace"
  | "runtimes"
  | "frameworks"
  | "dependencies"
  | "configurations"
  | "policies"
  | "targets"
  | "warnings"
>;

export function projectSnapshotDigest(
  project: ProjectSnapshotDigestSource
): Digest {
  return digestJson(
    {
      revision: project.revision,
      packageManager: project.packageManager,
      workspace: project.workspace,
      runtimes: project.runtimes,
      frameworks: project.frameworks,
      dependencies: project.dependencies,
      configurations: project.configurations,
      policies: project.policies,
      targets: project.targets,
      warnings: project.warnings
    } as JsonValue
  );
}
