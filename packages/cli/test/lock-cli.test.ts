import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { digestJson, type Digest } from "@soren-sdk/contracts";
import {
  ConfigurationReader,
  LockfileService,
  NodeFileSystem,
  PolicyResolver
} from "@soren-sdk/config";
import { inspectProject } from "@soren-sdk/core";
import { FileSystemConnectorCatalog } from "@soren-sdk/connectors";

import { runCli, type CliIo } from "../src/index.js";

function repositoryRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

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

const CONFIG_YAML = `schemaVersion: "1.0.0-draft.1"
contractKind: soren-config
configId: lock-project
preferences:
  preferredProviders: [web-platform]
  maxProviders: 2
`;

const POLICY_YAML = `schemaVersion: "1.0.0-draft.1"
contractKind: policy
policyId: lock-project-policy
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

const ROUTE_PLAN = {
  schemaVersion: "1.0.0-draft.1",
  contractKind: "route-plan",
  planId: "rp-lock-1",
  createdAt: "2026-08-01T00:00:00.000Z",
  status: "approved",
  requestId: "req-lock-1",
  projectSnapshotId: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  catalogSnapshotId: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  policySnapshotId: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  requestedCapabilities: ["css-animation"],
  selectedProviders: [],
  rejectedProviders: [],
  ownership: [],
  constraints: [],
  uncertainty: 0,
  requiredInput: [],
  digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000"
};

async function setupProject(root: string): Promise<void> {
  await mkdir(join(root, ".soren-sdk"), { recursive: true });
  await writeFile(join(root, "package.json"), '{"name":"lock-project","version":"1.0.0"}', "utf8");
  await writeFile(join(root, ".soren-sdk", "config.yaml"), CONFIG_YAML, "utf8");
  await writeFile(join(root, ".soren-sdk", "policy.yaml"), POLICY_YAML, "utf8");
  await writeFile(join(root, "route-plan.json"), JSON.stringify(ROUTE_PLAN), "utf8");
}

interface CurrentInputs {
  projectSnapshotId: Digest;
  catalogSnapshotId: Digest;
  policySnapshotId: Digest;
  configDigest: Digest;
}

async function currentInputs(
  projectRoot: string,
  cwd: string
): Promise<CurrentInputs> {
  const fs = new NodeFileSystem();
  const projectSnapshot = inspectProject({
    root: projectRoot,
    createdAt: "2026-08-01T00:00:00.000Z"
  });
  const catalogSnapshot = new FileSystemConnectorCatalog({
    root: cwd
  }).snapshot("2026-08-01T00:00:00.000Z");
  const policy = new PolicyResolver().resolve({ projectRoot, fs });
  const config = new ConfigurationReader({ fs }).loadProjectConfig(projectRoot);
  return {
    projectSnapshotId: projectSnapshot.snapshotId,
    catalogSnapshotId: catalogSnapshot.snapshotId,
    policySnapshotId: policy.snapshotId,
    configDigest: config.digest
  };
}

async function createMatchingLock(
  projectRoot: string,
  cwd: string,
  lockPath: string,
  routePlanId = "",
  routePlanDigest = digestJson("")
): Promise<void> {
  const current = await currentInputs(projectRoot, cwd);
  const lock = new LockfileService().create({
    projectSnapshotId: current.projectSnapshotId,
    catalogSnapshotId: current.catalogSnapshotId,
    policySnapshotId: current.policySnapshotId,
    configDigest: current.configDigest,
    routePlanId,
    routePlanDigest,
    capabilityOntologyVersion: "1.0.0-draft.1",
    connectors: [],
    unavailable: [],
    generatedAt: "2026-08-01T00:00:00.000Z"
  });
  await writeFile(lockPath, JSON.stringify(lock, null, 2), "utf8");
}

describe("Soren SDK CLI lock inspect", () => {
  it("inspects a valid lock in human and stable JSON forms", async () => {
    const project = await mkdtemp(join(tmpdir(), "soren-sdk-lock-inspect-"));
    try {
      await setupProject(project);
      const lockPath = join(project, "soren-sdk.lock");
      await createMatchingLock(project, repositoryRoot(), lockPath);

      const human = captureIo();
      expect(
        runCli({
          argv: ["lock", "inspect", lockPath],
          cwd: repositoryRoot(),
          io: human.io
        })
      ).toBe(0);
      expect(human.stdout.join("")).toContain("Soren SDK lock: sha256:");

      const json = captureIo();
      expect(
        runCli({
          argv: ["lock", "inspect", lockPath, "--json"],
          cwd: repositoryRoot(),
          io: json.io
        })
      ).toBe(0);
      const parsed = JSON.parse(json.stdout.join("")) as { ok: boolean };
      expect(parsed.ok).toBe(true);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("rejects a tampered lock with exit 1", async () => {
    const project = await mkdtemp(join(tmpdir(), "soren-sdk-lock-tampered-"));
    try {
      await setupProject(project);
      const lockPath = join(project, "soren-sdk.lock");
      await createMatchingLock(project, repositoryRoot(), lockPath);
      const lock = JSON.parse(await readFile(lockPath, "utf8")) as {
        routePlanId: string;
      };
      lock.routePlanId = "tampered";
      await writeFile(lockPath, JSON.stringify(lock), "utf8");

      const io = captureIo();
      expect(
        runCli({
          argv: ["lock", "inspect", lockPath, "--json"],
          cwd: repositoryRoot(),
          io: io.io
        })
      ).toBe(1);
      expect(io.stderr.join("")).toContain("digest-mismatch");
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("does not write while inspecting a lock", async () => {
    const project = await mkdtemp(join(tmpdir(), "soren-sdk-lock-readonly-"));
    try {
      await setupProject(project);
      const lockPath = join(project, "soren-sdk.lock");
      await createMatchingLock(project, repositoryRoot(), lockPath);
      const before = (await readdir(project)).sort();
      const io = captureIo();
      expect(
        runCli({ argv: ["lock", "inspect", lockPath], cwd: "/", io: io.io })
      ).toBe(0);
      expect((await readdir(project)).sort()).toEqual(before);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
});

describe("Soren SDK CLI lock check", () => {
  it("reports in sync for a matching lock", async () => {
    const project = await mkdtemp(join(tmpdir(), "soren-sdk-lock-check-"));
    try {
      await setupProject(project);
      const lockPath = join(project, "soren-sdk.lock");
      await createMatchingLock(project, repositoryRoot(), lockPath);

      const json = captureIo();
      expect(
        runCli({
          argv: ["lock", "check", lockPath, "--project", project, "--json"],
          cwd: repositoryRoot(),
          io: json.io
        })
      ).toBe(0);
      const parsed = JSON.parse(json.stdout.join("")) as {
        inSync: boolean;
        drifts: unknown[];
      };
      expect(parsed.inSync).toBe(true);
      expect(parsed.drifts).toEqual([]);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("reports critical drift and exits 1 when the config changes", async () => {
    const project = await mkdtemp(join(tmpdir(), "soren-sdk-lock-drift-"));
    try {
      await setupProject(project);
      const lockPath = join(project, "soren-sdk.lock");
      await createMatchingLock(project, repositoryRoot(), lockPath);

      await writeFile(
        join(project, ".soren-sdk", "config.yaml"),
        CONFIG_YAML.replace("preferredProviders: [web-platform]", "preferredProviders: [motion, web-platform]"),
        "utf8"
      );

      const io = captureIo();
      expect(
        runCli({
          argv: ["lock", "check", lockPath, "--project", project, "--json"],
          cwd: repositoryRoot(),
          io: io.io
        })
      ).toBe(1);
      expect(io.stdout.join("")).toContain("config");
      expect(io.stdout.join("")).toContain("critical");
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("does not write while checking a lock", async () => {
    const project = await mkdtemp(join(tmpdir(), "soren-sdk-lock-check-readonly-"));
    try {
      await setupProject(project);
      const lockPath = join(project, "soren-sdk.lock");
      await createMatchingLock(project, repositoryRoot(), lockPath);
      const before = (await readdir(project)).sort();
      const io = captureIo();
      expect(
        runCli({
          argv: ["lock", "check", lockPath, "--project", project],
          cwd: repositoryRoot(),
          io: io.io
        })
      ).toBe(0);
      expect((await readdir(project)).sort()).toEqual(before);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
});

describe("Soren SDK CLI lock create", () => {
  it("creates an atomic, valid lockfile and reports it", async () => {
    const project = await mkdtemp(join(tmpdir(), "soren-sdk-lock-create-"));
    const outDir = await mkdtemp(join(tmpdir(), "soren-sdk-lock-out-"));
    try {
      await setupProject(project);
      const routePlan = join(project, "route-plan.json");
      const output = join(outDir, "soren-sdk.lock");

      const io = captureIo();
      expect(
        runCli({
          argv: [
            "lock",
            "create",
            "--project",
            project,
            "--route-plan",
            routePlan,
            "--output",
            output,
            "--json"
          ],
          cwd: repositoryRoot(),
          io: io.io
        })
      ).toBe(0);

      const parsed = JSON.parse(io.stdout.join("")) as {
        contractKind: string;
        routePlanId: string;
        digest: string;
      };
      expect(parsed.contractKind).toBe("soren-sdk-lock");
      expect(parsed.routePlanId).toBe("rp-lock-1");
      expect(parsed.digest).toMatch(/^sha256:/);

      const written = JSON.parse(await readFile(output, "utf8")) as unknown;
      expect(new LockfileService().validate(written).ok).toBe(true);
      expect(await readdir(outDir)).toEqual(["soren-sdk.lock"]);
    } finally {
      await rm(project, { recursive: true, force: true });
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("requires --output and --route-plan with exit 2", async () => {
    const project = await mkdtemp(join(tmpdir(), "soren-sdk-lock-usage-"));
    try {
      await setupProject(project);

      const noOutput = captureIo();
      expect(
        runCli({
          argv: ["lock", "create", "--project", project],
          cwd: "/",
          io: noOutput.io
        })
      ).toBe(2);
      expect(noOutput.stderr.join("")).toContain("--output");

      const noRoutePlan = captureIo();
      expect(
        runCli({
          argv: [
            "lock",
            "create",
            "--project",
            project,
            "--output",
            join(project, "soren-sdk.lock")
          ],
          cwd: "/",
          io: noRoutePlan.io
        })
      ).toBe(2);
      expect(noRoutePlan.stderr.join("")).toContain("--route-plan");
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("refuses to overwrite an existing output without --force", async () => {
    const project = await mkdtemp(join(tmpdir(), "soren-sdk-lock-overwrite-"));
    try {
      await setupProject(project);
      const routePlan = join(project, "route-plan.json");
      const output = join(project, "existing.lock");
      await writeFile(output, "ORIGINAL", "utf8");

      const io = captureIo();
      expect(
        runCli({
          argv: [
            "lock",
            "create",
            "--project",
            project,
            "--route-plan",
            routePlan,
            "--output",
            output
          ],
          cwd: repositoryRoot(),
          io: io.io
        })
      ).toBe(1);
      expect(io.stderr.join("")).toContain("--force");
      expect(await readFile(output, "utf8")).toBe("ORIGINAL");
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("overwrites an existing output with --force", async () => {
    const project = await mkdtemp(join(tmpdir(), "soren-sdk-lock-force-"));
    try {
      await setupProject(project);
      const routePlan = join(project, "route-plan.json");
      const output = join(project, "existing.lock");
      await writeFile(output, "ORIGINAL", "utf8");

      const io = captureIo();
      expect(
        runCli({
          argv: [
            "lock",
            "create",
            "--project",
            project,
            "--route-plan",
            routePlan,
            "--output",
            output,
            "--force",
            "--json"
          ],
          cwd: repositoryRoot(),
          io: io.io
        })
      ).toBe(0);
      const parsed = JSON.parse(io.stdout.join("")) as { digest: string };
      expect(parsed.digest).toMatch(/^sha256:/);
      const written = JSON.parse(await readFile(output, "utf8")) as unknown;
      expect(new LockfileService().validate(written).ok).toBe(true);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("refuses a symlinked output path", async () => {
    const project = await mkdtemp(join(tmpdir(), "soren-sdk-lock-symlink-"));
    try {
      await setupProject(project);
      const routePlan = join(project, "route-plan.json");
      const target = join(project, "real.lock");
      const output = join(project, "link.lock");
      await writeFile(target, "TARGET", "utf8");
      await symlink(target, output);

      const io = captureIo();
      expect(
        runCli({
          argv: [
            "lock",
            "create",
            "--project",
            project,
            "--route-plan",
            routePlan,
            "--output",
            output,
            "--force"
          ],
          cwd: repositoryRoot(),
          io: io.io
        })
      ).toBe(1);
      expect(io.stderr.join("")).toContain("symbolic link");
      expect(await readFile(target, "utf8")).toBe("TARGET");
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("refuses an output path traversing parent directories", async () => {
    const project = await mkdtemp(join(tmpdir(), "soren-sdk-lock-traversal-"));
    try {
      await setupProject(project);
      const routePlan = join(project, "route-plan.json");
      const io = captureIo();
      expect(
        runCli({
          argv: [
            "lock",
            "create",
            "--project",
            project,
            "--route-plan",
            routePlan,
            "--output",
            "../escape.lock"
          ],
          cwd: project,
          io: io.io
        })
      ).toBe(1);
      expect(io.stderr.join("")).toContain("..");
      expect(
        await readdir(join(project, "..")).then((entries) =>
          entries.includes("escape.lock")
        )
      ).toBe(false);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("rejects credential-like input with exit 1", async () => {
    const project = await mkdtemp(join(tmpdir(), "soren-sdk-lock-credential-"));
    try {
      await setupProject(project);
      const routePlan = join(project, "route-plan.json");
      await writeFile(
        routePlan,
        JSON.stringify({ ...ROUTE_PLAN, planId: "rp-with-token" }),
        "utf8"
      );
      const output = join(project, "soren-sdk.lock");

      const io = captureIo();
      expect(
        runCli({
          argv: [
            "lock",
            "create",
            "--project",
            project,
            "--route-plan",
            routePlan,
            "--output",
            output,
            "--force"
          ],
          cwd: repositoryRoot(),
          io: io.io
        })
      ).toBe(1);
      expect(io.stderr.join("")).toContain("LOCK_CREDENTIAL_REJECTED");
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
});
