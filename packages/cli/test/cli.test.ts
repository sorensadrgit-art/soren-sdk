import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

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

describe("Soren SDK CLI", () => {
  it("inspects the repository in human and stable JSON forms", () => {
    const human = captureIo();
    expect(
      runCli({ argv: ["inspect"], cwd: repositoryRoot(), io: human.io })
    ).toBe(0);
    expect(human.stdout.join("")).toContain("Project snapshot:");
    expect(human.stdout.join("")).toContain("package manager: pnpm@11.17.0");

    const json = captureIo();
    expect(
      runCli({ argv: ["inspect", ".", "--json"], cwd: repositoryRoot(), io: json.io })
    ).toBe(0);
    expect(JSON.parse(json.stdout.join(""))).toMatchObject({
      contractKind: "project-snapshot",
      packageManager: { name: "pnpm" }
    });
  });

  it("returns stable inspect usage and failure exit codes", async () => {
    const invalid = captureIo();
    expect(
      runCli({
        argv: ["inspect", ".", "another"],
        cwd: repositoryRoot(),
        io: invalid.io
      })
    ).toBe(2);
    expect(invalid.stderr.join("")).toContain("at most one project path");

    const empty = await mkdtemp(join(tmpdir(), "soren-sdk-empty-project-"));
    try {
      const failure = captureIo();
      expect(
        runCli({ argv: ["inspect", empty], cwd: repositoryRoot(), io: failure.io })
      ).toBe(1);
      expect(failure.stderr.join("")).toContain("PROJECT_ROOT_INVALID");
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it("does not write while inspecting", async () => {
    const root = await mkdtemp(join(tmpdir(), "soren-sdk-inspect-readonly-"));
    try {
      await writeFile(join(root, "package.json"), '{"name":"readonly"}', "utf8");
      const before = await readdir(root);
      const io = captureIo();
      expect(runCli({ argv: ["inspect", root, "--json"], cwd: "/", io: io.io })).toBe(
        0
      );
      expect(await readdir(root)).toEqual(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("lists connector IDs in human and stable JSON forms", () => {
    const human = captureIo();
    expect(
      runCli({ argv: ["catalog", "list"], cwd: repositoryRoot(), io: human.io })
    ).toBe(0);
    expect(human.stdout.join("")).toContain("web-platform\tschema-v2\tfalse");

    const json = captureIo();
    expect(
      runCli({
        argv: ["catalog", "list", "--json"],
        cwd: repositoryRoot(),
        io: json.io
      })
    ).toBe(0);
    const parsed = JSON.parse(json.stdout.join("")) as unknown[];
    expect(parsed.length).toBeGreaterThan(1);
  });

  it("gets a connector and returns health JSON", () => {
    const get = captureIo();
    expect(
      runCli({
        argv: ["catalog", "get", "web-platform", "--json"],
        cwd: repositoryRoot(),
        io: get.io
      })
    ).toBe(0);
    expect(JSON.parse(get.stdout.join(""))).toMatchObject({
      kind: "schema-v2",
      manifest: { connector: { id: "web-platform" } }
    });

    const health = captureIo();
    expect(
      runCli({
        argv: ["connector", "health", "web-platform", "--json"],
        cwd: repositoryRoot(),
        io: health.io
      })
    ).toBe(0);
    expect(JSON.parse(health.stdout.join(""))).toMatchObject({
      connectorId: "web-platform",
      state: "blocked"
    });
  });

  it("returns exit code 2 for unknown connectors and invalid arguments", () => {
    const unknown = captureIo();
    expect(
      runCli({
        argv: ["catalog", "get", "does-not-exist"],
        cwd: repositoryRoot(),
        io: unknown.io
      })
    ).toBe(2);
    expect(unknown.stderr.join("")).toContain("Unknown connector");

    const invalid = captureIo();
    expect(
      runCli({ argv: ["catalog"], cwd: repositoryRoot(), io: invalid.io })
    ).toBe(2);
    expect(invalid.stderr.join("")).toContain("Usage:");
  });

  it("writes only when catalog snapshot receives --database", async () => {
    const directory = await mkdtemp(join(tmpdir(), "soren-sdk-cli-"));
    const database = join(directory, "catalog.sqlite");
    try {
      const list = captureIo();
      expect(
        runCli({ argv: ["catalog", "list"], cwd: repositoryRoot(), io: list.io })
      ).toBe(0);
      expect(existsSync(database)).toBe(false);

      const snapshot = captureIo();
      expect(
        runCli({
          argv: ["catalog", "snapshot", "--database", database, "--json"],
          cwd: repositoryRoot(),
          io: snapshot.io
        })
      ).toBe(0);
      expect(existsSync(database)).toBe(true);
      expect(JSON.parse(snapshot.stdout.join(""))).toMatchObject({
        contractKind: "catalog-snapshot"
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
