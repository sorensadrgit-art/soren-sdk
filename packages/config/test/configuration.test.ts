import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Digest } from "@soren-sdk/contracts";
import {
  ConfigLoadError,
  ConfigParseError,
  ConfigurationReader,
  MemoryFileSystem,
} from "../src/index.js";

function policyYaml(scope: string, policyId: string): string {
  return [
    "schemaVersion: 1.0.0-draft.1",
    "contractKind: policy",
    `policyId: ${policyId}`,
    "version: 1.0.0",
    `scope: ${scope}`,
    "rules:",
    "  allowedConnectors: []",
    "  deniedConnectors: []",
    "  allowExperimental: false",
    "  allowedLicenses: [MIT]",
    "  allowPaidServices: false",
    "  network:",
    "    mode: deny",
    "    allowedHosts: []",
    "  filesystem:",
    "    read: []",
    "    write: []",
    "  allowRemoteProjectContent: false",
    "  requireReducedMotion: true",
    "  requiredApprovals: []",
    "",
  ].join("\n");
}

function makeReader(workspaceRoot?: string): {
  fs: MemoryFileSystem;
  reader: ConfigurationReader;
} {
  const fs = new MemoryFileSystem();
  const reader = new ConfigurationReader({
    fs,
    ...(workspaceRoot !== undefined ? { workspaceRoot } : {}),
  });
  return { fs, reader };
}

const VALID_CONFIG_YAML = [
  "schemaVersion: 1.0.0-draft.1",
  "contractKind: soren-config",
  "configId: web-platform-example",
  "preferences:",
  "  preferredProviders: [web-platform]",
  "  forbiddenProviders: [gsap]",
  "  maxProviders: 1",
  "",
].join("\n");

const VALID_CONFIG_JSON = JSON.stringify({
  schemaVersion: "1.0.0-draft.1",
  contractKind: "soren-config",
  configId: "web-platform-example",
  preferences: {
    preferredProviders: ["web-platform"],
    forbiddenProviders: ["gsap"],
    maxProviders: 1,
  },
});

describe("ConfigurationReader.loadProjectConfig", () => {
  it("loads a valid yaml config and produces a stable sha256 digest", () => {
    const { fs, reader } = makeReader();
    fs.writeFileAtomic(
      join("/project", ".soren-sdk", "config.yaml"),
      VALID_CONFIG_YAML
    );

    const loaded = reader.loadProjectConfig("/project");
    expect(loaded.config.configId).toBe("web-platform-example");
    expect(loaded.config.preferences?.preferredProviders).toEqual(["web-platform"]);
    expect(loaded.source.format).toBe("yaml");
    expect(loaded.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("loads a valid json config", () => {
    const { fs, reader } = makeReader();
    fs.writeFileAtomic(
      join("/project", ".soren-sdk", "config.json"),
      VALID_CONFIG_JSON
    );
    const loaded = reader.loadProjectConfig("/project");
    expect(loaded.config.configId).toBe("web-platform-example");
    expect(loaded.source.format).toBe("json");
  });

  it("throws CONFIG_NOT_FOUND when no config exists", () => {
    const { reader } = makeReader();
    try {
      reader.loadProjectConfig("/project");
      throw new Error("expected CONFIG_NOT_FOUND");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigLoadError);
      expect((error as ConfigLoadError).code).toBe("CONFIG_NOT_FOUND");
    }
  });

  it("throws CONFIG_AMBIGUOUS when both yaml and json exist", () => {
    const { fs, reader } = makeReader();
    fs.writeFileAtomic(join("/project", ".soren-sdk", "config.yaml"), VALID_CONFIG_YAML);
    fs.writeFileAtomic(join("/project", ".soren-sdk", "config.json"), VALID_CONFIG_JSON);
    expect(() => reader.loadProjectConfig("/project")).toThrowError(
      ConfigLoadError
    );
  });

  it("throws CONFIG_INVALID for an unknown field", () => {
    const { fs, reader } = makeReader();
    fs.writeFileAtomic(
      join("/project", ".soren-sdk", "config.yaml"),
      VALID_CONFIG_YAML.replace("maxProviders: 1", "maxProviders: 1\n  unknown: true")
    );
    try {
      reader.loadProjectConfig("/project");
      throw new Error("expected CONFIG_INVALID");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigLoadError);
      expect((error as ConfigLoadError).code).toBe("CONFIG_INVALID");
    }
  });

  it("rejects prototype-pollution-shaped config at parse time", () => {
    const { fs, reader } = makeReader();
    fs.writeFileAtomic(
      join("/project", ".soren-sdk", "config.yaml"),
      VALID_CONFIG_YAML.replace(
        "preferences:",
        "preferences:\n  __proto__: {polluted: true}"
      )
    );
    expect(() => reader.loadProjectConfig("/project")).toThrowError(
      ConfigParseError
    );
  });

  it("produces an identical digest regardless of list ordering", () => {
    const { fs, reader } = makeReader();
    const first = VALID_CONFIG_YAML.replace(
      "preferredProviders: [web-platform]",
      "preferredProviders: [web-platform, gsap]"
    );
    const second = VALID_CONFIG_YAML.replace(
      "preferredProviders: [web-platform]",
      "preferredProviders: [gsap, web-platform]"
    );
    fs.writeFileAtomic(join("/project", ".soren-sdk", "config.yaml"), first);
    const a = reader.loadProjectConfig("/project").digest;
    fs.writeFileAtomic(join("/project", ".soren-sdk", "config.yaml"), second);
    const b = reader.loadProjectConfig("/project").digest;
    expect(a).toBe(b);
  });
});

describe("ConfigurationReader.loadPolicyLayers", () => {
  it("loads the project policy layer", () => {
    const { fs, reader } = makeReader();
    fs.writeFileAtomic(
      join("/project", ".soren-sdk", "policy.yaml"),
      policyYaml("project", "project-policy")
    );
    const layers = reader.loadPolicyLayers("/project");
    expect(layers).toHaveLength(1);
    expect(layers[0]?.document.policyId).toBe("project-policy");
    expect(layers[0]?.source.scope).toBe("project");
  });

  it("discovers a workspace policy layer from an ancestor", () => {
    const { fs, reader } = makeReader("/workspace");
    fs.writeFileAtomic(
      join("/workspace", ".soren-sdk", "policy.yaml"),
      policyYaml("workspace", "workspace-policy")
    );
    const layers = reader.loadPolicyLayers("/workspace/packages/app");
    expect(layers.map((layer) => layer.source.scope)).toEqual(["workspace"]);
  });

  it("returns workspace layer before project layer", () => {
    const { fs, reader } = makeReader("/workspace");
    fs.writeFileAtomic(
      join("/workspace", ".soren-sdk", "policy.yaml"),
      policyYaml("workspace", "workspace-policy")
    );
    fs.writeFileAtomic(
      join("/workspace/packages/app", ".soren-sdk", "policy.yaml"),
      policyYaml("project", "project-policy")
    );
    const layers = reader.loadPolicyLayers("/workspace/packages/app");
    expect(layers.map((layer) => layer.source.scope)).toEqual([
      "workspace",
      "project",
    ]);
  });

  it("returns an empty list when no policy files exist", () => {
    const { reader } = makeReader();
    expect(reader.loadPolicyLayers("/project")).toEqual([]);
  });
});
