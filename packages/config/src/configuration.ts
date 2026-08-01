import { dirname } from "node:path";
import {
  digestJson,
  validateContract,
} from "@soren-sdk/contracts";
import type {
  Digest,
  PolicyDocument,
  SorenConfig,
} from "@soren-sdk/contracts";
import type { FileSystemAdapter } from "./adapters/filesystem.js";
import {
  findSingleSource,
  sorenConfigPaths,
  sorenPolicyPaths,
} from "./discovery.js";
import type { ConfigFileFormat } from "./discovery.js";
import { ConfigLoadError } from "./errors.js";
import { asPlainObject, parseJsonText, parseYamlText } from "./parse.js";

export interface LoadedConfiguration {
  config: SorenConfig;
  digest: Digest;
  source: { format: ConfigFileFormat; path: string };
}

export interface PolicyLayer {
  document: PolicyDocument;
  source: {
    scope: PolicyDocument["scope"];
    format: ConfigFileFormat;
    path: string;
  };
}

export interface ConfigurationReaderOptions {
  fs: FileSystemAdapter;
  workspaceRoot?: string;
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

/** Normalize a validated config: stable-unique lists, drop undefined optionals. */
export function normalizeSorenConfig(config: SorenConfig): SorenConfig {
  const normalized: SorenConfig = {
    schemaVersion: config.schemaVersion,
    contractKind: config.contractKind,
    configId: config.configId,
  };
  const preferences = config.preferences;
  if (preferences !== undefined) {
    const normalizedPreferences: NonNullable<SorenConfig["preferences"]> = {};
    if (preferences.preferredProviders !== undefined) {
      normalizedPreferences.preferredProviders = stableUnique(
        preferences.preferredProviders
      );
    }
    if (preferences.forbiddenProviders !== undefined) {
      normalizedPreferences.forbiddenProviders = stableUnique(
        preferences.forbiddenProviders
      );
    }
    if (preferences.maxProviders !== undefined) {
      normalizedPreferences.maxProviders = preferences.maxProviders;
    }
    normalized.preferences = normalizedPreferences;
  }
  return normalized;
}

function parseDocument(
  fs: FileSystemAdapter,
  path: string,
  format: ConfigFileFormat
): Record<string, unknown> {
  const text = fs.readFile(path);
  if (text === undefined) {
    throw new ConfigLoadError("CONFIG_NOT_FOUND", `file not found: ${path}`, path);
  }
  const value =
    format === "json" ? parseJsonText(text, path) : parseYamlText(text, path);
  return asPlainObject(value);
}

/**
 * Loads and validates project configuration and policy layers from a
 * `.soren-sdk` directory, backed by an injectable `FileSystemAdapter`.
 */
export class ConfigurationReader {
  readonly #fs: FileSystemAdapter;
  readonly #workspaceRoot: string | undefined;

  constructor(options: ConfigurationReaderOptions) {
    this.#fs = options.fs;
    if (options.workspaceRoot !== undefined) {
      this.#workspaceRoot = options.workspaceRoot;
    }
  }

  loadProjectConfig(projectRoot: string): LoadedConfiguration {
    const source = findSingleSource(this.#fs, sorenConfigPaths(projectRoot));
    if (source === undefined) {
      throw new ConfigLoadError(
        "CONFIG_NOT_FOUND",
        `no config file found under ${projectRoot}/.soren-sdk`,
        projectRoot
      );
    }
    const document = parseDocument(this.#fs, source.path, source.format);
    const result = validateContract<SorenConfig>("soren-config", document);
    if (!result.ok) {
      throw new ConfigLoadError(
        "CONFIG_INVALID",
        `config file ${source.path} does not satisfy the soren-config contract`,
        source.path,
        { issues: result.issues }
      );
    }
    const config = normalizeSorenConfig(result.value);
    return {
      config,
      digest: digestJson(config),
      source: { format: source.format, path: source.path },
    };
  }

  loadPolicyLayers(projectRoot: string): PolicyLayer[] {
    const layers: PolicyLayer[] = [];

    const workspace = this.#findWorkspacePolicyLayer(projectRoot);
    if (workspace !== undefined) {
      layers.push(workspace);
    }

    const project = this.#findProjectPolicyLayer(projectRoot);
    if (project !== undefined) {
      layers.push(project);
    }

    return layers;
  }

  #findProjectPolicyLayer(projectRoot: string): PolicyLayer | undefined {
    return this.#loadPolicyLayer(projectRoot, "project");
  }

  #findWorkspacePolicyLayer(projectRoot: string): PolicyLayer | undefined {
    let dir = dirname(projectRoot);
    while (true) {
      const layer = this.#loadPolicyLayer(dir, "workspace");
      if (layer !== undefined) {
        return layer;
      }
      const parent = dirname(dir);
      if (parent === dir) {
        return undefined;
      }
      if (this.#workspaceRoot !== undefined && dir === this.#workspaceRoot) {
        return undefined;
      }
      dir = parent;
    }
  }

  #loadPolicyLayer(
    root: string,
    scope: PolicyDocument["scope"]
  ): PolicyLayer | undefined {
    const source = findSingleSource(this.#fs, sorenPolicyPaths(root));
    if (source === undefined) {
      return undefined;
    }
    const document = parseDocument(this.#fs, source.path, source.format);
    const result = validateContract<PolicyDocument>("policy", document);
    if (!result.ok) {
      throw new ConfigLoadError(
        "CONFIG_INVALID",
        `policy file ${source.path} does not satisfy the policy contract`,
        source.path,
        { issues: result.issues }
      );
    }
    return {
      document: result.value,
      source: { scope, format: source.format, path: source.path },
    };
  }
}

export type ConfigurationReaderPort = Pick<
  ConfigurationReader,
  "loadProjectConfig" | "loadPolicyLayers"
>;
