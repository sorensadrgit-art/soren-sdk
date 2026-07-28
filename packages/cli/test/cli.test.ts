import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
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

describe("catalog CLI", () => {
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
