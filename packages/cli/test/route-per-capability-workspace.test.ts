import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runCli, type CliIo } from "../src/index.js";

function repositoryRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

function captureIo(): { io: CliIo; stderr: string[]; stdout: string[] } {
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

describe("route CLI per-capability workspace selection", () => {
  it("routes Motion and GSAP to different workspaces", async () => {
    const project = await mkdtemp(join(tmpdir(), "soren-sdk-route-multi-workspace-"));
    try {
      await mkdir(join(project, "packages", "app"), { recursive: true });
      await mkdir(join(project, "packages", "admin"), { recursive: true });
      await writeFile(
        join(project, "package.json"),
        JSON.stringify({
          name: "multi-workspace-route-fixture",
          private: true,
          workspaces: ["packages/*"]
        }),
        "utf8"
      );
      await writeFile(
        join(project, "packages", "app", "package.json"),
        JSON.stringify({
          name: "app",
          private: true,
          dependencies: { react: "19.0.0", motion: "12.42.2" }
        }),
        "utf8"
      );
      await writeFile(
        join(project, "packages", "admin", "package.json"),
        JSON.stringify({
          name: "admin",
          private: true,
          dependencies: { gsap: "3.15.0" }
        }),
        "utf8"
      );

      const output = captureIo();
      const exitCode = runCli({
        argv: [
          "route",
          "--project",
          project,
          "--capability",
          "motion.layout",
          "--capability",
          "motion.timeline",
          "--capability-workspace",
          "motion.layout=packages/app",
          "--capability-workspace",
          "motion.timeline=packages/admin",
          "--json"
        ],
        cwd: repositoryRoot(),
        io: output.io
      });

      expect(exitCode).toBe(0);
      expect(JSON.parse(output.stdout.join(""))).toMatchObject({
        status: "selected",
        selectedProviders: expect.arrayContaining([
          expect.objectContaining({ providerId: "motion" }),
          expect.objectContaining({ providerId: "gsap" })
        ])
      });
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("rejects mappings for capabilities not present in the request", () => {
    const output = captureIo();
    const exitCode = runCli({
      argv: [
        "route",
        "--capability",
        "motion.timeline",
        "--capability-workspace",
        "motion.layout=packages/app"
      ],
      cwd: repositoryRoot(),
      io: output.io
    });

    expect(exitCode).toBe(2);
    expect(output.stderr.join("")).toContain(
      "--capability-workspace must reference a requested capability"
    );
  });
});
