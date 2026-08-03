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

const CONFIG_YAML = `schemaVersion: "1.0.0-draft.1"
contractKind: soren-config
configId: demo-project
preferences:
  preferredProviders: [web-platform]
  maxProviders: 2
`;

describe("Soren SDK CLI config show", () => {
  it("prints a human summary and stable JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "soren-sdk-config-show-"));
    try {
      await mkdir(join(root, ".soren-sdk"), { recursive: true });
      await writeFile(join(root, ".soren-sdk", "config.yaml"), CONFIG_YAML, "utf8");

      const human = captureIo();
      expect(
        runCli({
          argv: ["config", "show", "--project", root],
          cwd: "/",
          io: human.io
        })
      ).toBe(0);
      expect(human.stdout.join("")).toContain("Config: demo-project");
      expect(human.stdout.join("")).toContain("digest: sha256:");

      const json = captureIo();
      expect(
        runCli({
          argv: ["config", "show", "--project", root, "--json"],
          cwd: "/",
          io: json.io
        })
      ).toBe(0);
      const parsed = JSON.parse(json.stdout.join("")) as {
        config: { configId: string };
        digest: string;
        source: { format: string };
      };
      expect(parsed.config.configId).toBe("demo-project");
      expect(parsed.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(parsed.source.format).toBe("yaml");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not write while showing config", async () => {
    const root = await mkdtemp(join(tmpdir(), "soren-sdk-config-readonly-"));
    try {
      await mkdir(join(root, ".soren-sdk"), { recursive: true });
      await writeFile(join(root, ".soren-sdk", "config.yaml"), CONFIG_YAML, "utf8");
      const before = (await readdir(root)).sort();
      const io = captureIo();
      expect(
        runCli({
          argv: ["config", "show", "--project", root],
          cwd: "/",
          io: io.io
        })
      ).toBe(0);
      expect((await readdir(root)).sort()).toEqual(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports a missing config with exit 1", async () => {
    const root = await mkdtemp(join(tmpdir(), "soren-sdk-config-missing-"));
    try {
      const io = captureIo();
      expect(
        runCli({
          argv: ["config", "show", "--project", root],
          cwd: "/",
          io: io.io
        })
      ).toBe(1);
      expect(io.stderr.join("")).toContain("CONFIG_NOT_FOUND");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
