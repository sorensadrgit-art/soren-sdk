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

  it("lists approved connector IDs in human and stable JSON forms", () => {
    const human = captureIo();
    expect(
      runCli({ argv: ["catalog", "list"], cwd: repositoryRoot(), io: human.io })
    ).toBe(0);
    expect(human.stdout.join("")).toContain("web-platform\tschema-v2\ttrue");
    expect(human.stdout.join("")).toContain("motion\tschema-v2\ttrue");
    expect(human.stdout.join("")).toContain("gsap\tschema-v2\ttrue");

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

  it("gets a connector and returns healthy status JSON", () => {
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
      state: "healthy",
      selectable: true
    });
  });

  it("routes a native capability in human and canonical JSON forms", () => {
    const human = captureIo();
    expect(
      runCli({
        argv: [
          "route",
          "--project",
          ".",
          "--capability",
          "platform.css-transition"
        ],
        cwd: repositoryRoot(),
        io: human.io
      })
    ).toBe(0);
    expect(human.stdout.join("")).toContain("Route status: native");
    expect(human.stdout.join("")).toContain("providers: none");

    const json = captureIo();
    expect(
      runCli({
        argv: [
          "route",
          "--project",
          ".",
          "--capability",
          "platform.css-transition",
          "--json"
        ],
        cwd: repositoryRoot(),
        io: json.io
      })
    ).toBe(0);
    expect(JSON.parse(json.stdout.join(""))).toMatchObject({
      contractKind: "route-plan",
      status: "native",
      selectedProviders: []
    });
  });

  it("parses repeated capabilities and provider constraints", () => {
    const json = captureIo();
    expect(
      runCli({
        argv: [
          "route",
          "--project",
          ".",
          "--capability",
          "motion.timeline",
          "--optional",
          "motion.svg",
          "--preferred",
          "gsap",
          "--forbidden",
          "motion",
          "--max-providers",
          "1",
          "--scope",
          "hero",
          "--property",
          "transform",
          "--json"
        ],
        cwd: repositoryRoot(),
        io: json.io
      })
    ).toBe(0);
    expect(JSON.parse(json.stdout.join(""))).toMatchObject({
      status: "selected",
      selectedProviders: [
        {
          providerId: "gsap",
          reasonCode: "PREFERRED_PROVIDER"
        }
      ]
    });
  });

  it("routes Motion only when the inspected project supports React", async () => {
    const project = await mkdtemp(join(tmpdir(), "soren-sdk-route-react-"));
    try {
      await writeFile(
        join(project, "package.json"),
        JSON.stringify({
          name: "react-route-fixture",
          dependencies: { react: "18.2.0" }
        }),
        "utf8"
      );
      const json = captureIo();
      expect(
        runCli({
          argv: [
            "route",
            "--project",
            project,
            "--capability",
            "motion.layout",
            "--json"
          ],
          cwd: repositoryRoot(),
          io: json.io
        })
      ).toBe(0);
      expect(JSON.parse(json.stdout.join(""))).toMatchObject({
        status: "selected",
        selectedProviders: [{ providerId: "motion" }]
      });
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("returns usage errors for missing capabilities and invalid provider limits", () => {
    const missing = captureIo();
    expect(
      runCli({
        argv: ["route", "--project", "."],
        cwd: repositoryRoot(),
        io: missing.io
      })
    ).toBe(2);
    expect(missing.stderr.join("")).toContain("at least one --capability");

    const invalid = captureIo();
    expect(
      runCli({
        argv: [
          "route",
          "--capability",
          "motion.timeline",
          "--max-providers",
          "not-a-number"
        ],
        cwd: repositoryRoot(),
        io: invalid.io
      })
    ).toBe(2);
    expect(invalid.stderr.join("")).toContain("non-negative integer");
  });

  it("does not write to an inspected project while routing", async () => {
    const project = await mkdtemp(join(tmpdir(), "soren-sdk-route-readonly-"));
    try {
      await writeFile(
        join(project, "package.json"),
        '{"name":"route-readonly"}',
        "utf8"
      );
      const before = await readdir(project);
      const io = captureIo();
      expect(
        runCli({
          argv: [
            "route",
            "--project",
            project,
            "--capability",
            "platform.css-transition",
            "--json"
          ],
          cwd: repositoryRoot(),
          io: io.io
        })
      ).toBe(0);
      expect(await readdir(project)).toEqual(before);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
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
