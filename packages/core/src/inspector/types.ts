import type { Digest } from "@soren-sdk/contracts";

export interface InspectProjectOptions {
  root: string;
  createdAt?: string;
}

export type ProjectInspectionErrorCode =
  | "PACKAGE_MANIFEST_INVALID"
  | "PROJECT_ROOT_INVALID"
  | "PROJECT_SNAPSHOT_INVALID";

export class ProjectInspectionError extends Error {
  override readonly name = "ProjectInspectionError";

  constructor(
    readonly code: ProjectInspectionErrorCode,
    message: string,
    readonly path?: string
  ) {
    super(message);
  }
}

export interface PackageManifest {
  name?: unknown;
  private?: unknown;
  packageManager?: unknown;
  workspaces?: unknown;
  engines?: unknown;
  browserslist?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
  peerDependencies?: unknown;
  optionalDependencies?: unknown;
}

export interface WorkspacePackageRecord {
  name: string;
  path: string;
  private: boolean;
  manifestPath: string;
  manifest: PackageManifest;
}

export interface PackageManagerDetection {
  packageManager: {
    name: "bun" | "npm" | "pnpm" | "unknown" | "yarn";
    version: string | null;
    lockfile: string | null;
    lockfileDigest: Digest | null;
  };
  warnings: string[];
}

export interface WorkspaceDetection {
  isMonorepo: boolean;
  packages: WorkspacePackageRecord[];
  warnings: string[];
}

export interface RevisionDetection {
  revision: {
    vcs: "git" | "none" | "unknown";
    commit: string | null;
    dirty: boolean;
  };
  warnings: string[];
}
