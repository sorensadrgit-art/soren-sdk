import { join } from "node:path";
import { ConfigLoadError } from "./errors.js";
import type { FileSystemAdapter } from "./adapters/filesystem.js";

export type ConfigFileKind = "config" | "policy";
export type ConfigFileFormat = "json" | "yaml";

export interface ConfigFileCandidate {
  kind: ConfigFileKind;
  format: ConfigFileFormat;
  path: string;
}

/** Candidate paths for the project config file, in lookup order. */
export function sorenConfigPaths(root: string): ConfigFileCandidate[] {
  return [
    { kind: "config", format: "yaml", path: join(root, ".soren-sdk", "config.yaml") },
    { kind: "config", format: "json", path: join(root, ".soren-sdk", "config.json") },
  ];
}

/** Candidate paths for a project policy layer, in lookup order. */
export function sorenPolicyPaths(root: string): ConfigFileCandidate[] {
  return [
    { kind: "policy", format: "yaml", path: join(root, ".soren-sdk", "policy.yaml") },
    { kind: "policy", format: "json", path: join(root, ".soren-sdk", "policy.json") },
  ];
}

/**
 * Return the single present candidate, or throw `CONFIG_AMBIGUOUS` when more
 * than one variant exists (e.g. both `config.yaml` and `config.json`).
 */
export function findSingleSource(
  fs: FileSystemAdapter,
  candidates: ConfigFileCandidate[]
): ConfigFileCandidate | undefined {
  const present = candidates.filter((candidate) => fs.exists(candidate.path));
  if (present.length > 1) {
    throw new ConfigLoadError(
      "CONFIG_AMBIGUOUS",
      `multiple ${present[0]?.kind ?? "config"} sources found: ${present
        .map((candidate) => candidate.path)
        .join(", ")}`,
      present.map((candidate) => candidate.path).join(", ")
    );
  }
  return present[0];
}
