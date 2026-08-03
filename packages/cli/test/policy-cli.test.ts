import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCli, type CliIo } from "../src/index.js";

function captureIo(): {
  io: CliIo;
  stderr: string[];
  stdout: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout(message) {
        stdout.push(message);
      },
      stderr(message) {
        stderr.push(message);
      }
    }
  };
}

const POLICY_YAML = `schemaVersion: "1.0.0-draft.1"
contractKind: policy
policyId: demo-project-policy
version: "1.0.0"
scope: project
rules:
  allowedConnectors: [web-platform]
  deniedConnectors: []
  allowExperimental: false
  allowedLicenses: [MIT]
  allowPaidServices: false
  network:
    mode: deny
    allowedHosts: []
  filesystem:
    read: []
    write: []
  allowRemoteProjectContent: false
  maxBundleKilobytes: 1024
  requireReducedMotion: true
  requiredApprovals: []
`;

const WEAKENING_POLICY_YAML = `schemaVersion: "1.0.0-draft.1"
contractKind: policy
policyId: weakening-project-policy
version: "1.0.0"
scope: project
rules:
  allowedConnectors: []
  deniedConnectors: []
  allowExperimental: true
  allowedLicenses: []
  allowPaidServices: false
  network:
    mode: deny
    allowedHosts: []
  filesystem:
    read: []
    write: []
  allowRemoteProjectContent: false
  maxBundleKilobytes: null
  requireReducedMotion: true
  requiredApprovals: []
`;

async function writeProjectPolicy(root: string, policy: string): Promise<void> {
  await mkdir(join(root, ".soren-sdk"), { recursive: true });
  await writeFile(join(root, ".soren-sdk", "policy.yaml"), policy, "utf8");
}

describe("Soren SDK CLI policy resolve", () => {
  it("resolves a tightening policy into human and stable JSON forms", async () => {
    const root = await mkdtemp(join(tmpdir(), "soren-sdk-policy-resolve-"));
    try {
      await writeProjectPolicy(root, POLICY_YAML);

      const human = captureIo();
      expect(
        runCli({
          argv: ["policy", "resolve", "--project", root],
          cwd: "/",
          io: human.io
        })
      ).toBe(0);
      expect(human.stdout.join("")).toContain("Resolved policy: sha256:");
      expect(human.stdout.join("")).toContain("allowedConnectors: web-platform");

      const json = captureIo();
      expect(
        runCli({
          argv: ["policy", "resolve", "--project", root, "--json"],
          cwd: "/",
          io: json.io
        })
      ).toBe(0);
      const parsed = JSON.parse(json.stdout.join("")) as {
        snapshotId: string;
        effective: { allowedConnectors: string[]; maxBundleKilobytes: number | null };
        layers: Array<{ scope: string }>;
      };
      expect(parsed.snapshotId).toMatch(/^sha256:/);
      expect(parsed.effective.allowedConnectors).toEqual(["web-platform"]);
      expect(parsed.effective.maxBundleKilobytes).toBe(1024);
      expect(parsed.layers.some((layer) => layer.scope === "project")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not write while resolving policy", async () => {
    const root = await mkdtemp(join(tmpdir(), "soren-sdk-policy-readonly-"));
    try {
      await writeProjectPolicy(root, POLICY_YAML);
      const before = (await readdir(root)).sort();
      const io = captureIo();
      expect(
        runCli({
          argv: ["policy", "resolve", "--project", root],
          cwd: "/",
          io: io.io
        })
      ).toBe(0);
      expect((await readdir(root)).sort()).toEqual(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails with exit 1 when a layer tries to weaken the policy", async () => {
    const root = await mkdtemp(join(tmpdir(), "soren-sdk-policy-weaken-"));
    try {
      await writeProjectPolicy(root, WEAKENING_POLICY_YAML);
      const io = captureIo();
      expect(
        runCli({
          argv: ["policy", "resolve", "--project", root, "--json"],
          cwd: "/",
          io: io.io
        })
      ).toBe(1);
      expect(io.stderr.join("")).toContain("POLICY_WEAKENING_DENIED");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
