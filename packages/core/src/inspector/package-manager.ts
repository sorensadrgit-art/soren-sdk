import { join } from "node:path";

import { digestFile, isRegularFile } from "./filesystem.js";
import type {
  PackageManagerDetection,
  PackageManifest
} from "./types.js";

const LOCKFILES = [
  { name: "pnpm" as const, file: "pnpm-lock.yaml" },
  { name: "npm" as const, file: "package-lock.json" },
  { name: "npm" as const, file: "npm-shrinkwrap.json" },
  { name: "yarn" as const, file: "yarn.lock" },
  { name: "bun" as const, file: "bun.lock" },
  { name: "bun" as const, file: "bun.lockb" }
];

type ManagerName = PackageManagerDetection["packageManager"]["name"];

function parsePackageManager(value: unknown): {
  name: Exclude<ManagerName, "unknown">;
  version: string;
} | null {
  if (typeof value !== "string") return null;
  const match = /^(pnpm|npm|yarn|bun)@(.+)$/.exec(value.trim());
  return match === null
    ? null
    : {
        name: match[1] as Exclude<ManagerName, "unknown">,
        version: match[2] as string
      };
}

export function detectPackageManager(
  root: string,
  manifest: PackageManifest
): PackageManagerDetection {
  const warnings: string[] = [];
  const declared = parsePackageManager(manifest.packageManager);
  if (manifest.packageManager !== undefined && declared === null) {
    warnings.push("Root packageManager field is present but not recognized.");
  }

  const lockfiles = LOCKFILES.filter((entry) =>
    isRegularFile(join(root, entry.file))
  );
  if (lockfiles.length > 1) {
    warnings.push(
      `Multiple package-manager lockfiles detected: ${lockfiles
        .map((entry) => entry.file)
        .join(", ")}.`
    );
  }

  let name: ManagerName = "unknown";
  let selected = null as (typeof LOCKFILES)[number] | null;

  if (declared !== null) {
    name = declared.name;
    selected = lockfiles.find((entry) => entry.name === declared.name) ?? null;
    if (lockfiles.some((entry) => entry.name !== declared.name)) {
      warnings.push(
        `packageManager declares ${declared.name}, but lockfiles for another manager also exist.`
      );
    }
    if (selected === null) {
      warnings.push(
        `packageManager declares ${declared.name}, but no matching lockfile was found.`
      );
    }
  } else {
    const managers = [...new Set(lockfiles.map((entry) => entry.name))];
    if (managers.length === 1) {
      name = managers[0] as Exclude<ManagerName, "unknown">;
      selected = lockfiles.find((entry) => entry.name === name) ?? null;
    } else if (managers.length > 1) {
      warnings.push(
        "Package manager is ambiguous because multiple manager lockfiles exist without a matching packageManager declaration."
      );
    }
  }

  return {
    packageManager: {
      name,
      version: declared !== null && declared.name === name ? declared.version : null,
      lockfile: selected?.file ?? null,
      lockfileDigest:
        selected === null ? null : digestFile(join(root, selected.file))
    },
    warnings: [...new Set(warnings)].sort()
  };
}
