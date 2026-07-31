import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseRouteOptions } from "../src/route-options.js";
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

async function project(
  manifest: Record<string, unknown>
): Promise<{ root: string; cleanup(): Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "soren-sdk-route-cli-"));
  await writeFile(join(root, "package.json"), JSON.stringify(manifest, null, 2));
  return {
    root,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    }
  };
}

describe("route CLI options", () => {
  it("parses repeated capabilities, preferences, and prohibitions", () => {
    expect(
      parseRouteOptions([
        "--project",
        "../app",
        "--capability",
        "motion.layout",
        "--capability",
        "motion.timeline",
        "--optional",
        "platform.css-transition",
        "--preferred",
        "motion",
        "--preferred",
        "gsap",
        "--forbidden",
        "web-platform",
        "--max-providers",
        "2",
        "--json"
      ])
    ).toEqual({
      project: "../app",
      capabilities: [
        { id: "motion.layout", required: true },
        { id: "motion.timeline", required: true },
        { id: "platform.css-transition", required: false }
      ],
      preferredProviders: ["motion", "gsap"],
      forbiddenProviders: ["web-platform"],
      maxProviders: 2,
      json: true
    });
  });

  it("defaults project, provider limit, and JSON output", () => {
    expect(
      parseRouteOptions(["--capability", "platform.css-transition"])
    ).toEqual({
      project: ".",
      capabilities: [
        { id: "platform.css-transition", required: true }
      ],
      preferredProviders: [],
      forbiddenProviders: [],
      maxProviders: 2,
      json: false
    });
  });

  it("applies a supplied scope and property to every capability", () => {
    expect(
      parseRouteOptions([
        "--capability",
        "motion.layout",
        "--optional",
        "motion.timeline",
        "--scope",
        "hero",
        "--property",
        "transform"
      ]).capabilities
    ).toEqual([
      {
        id: "motion.layout",
        required: true,
        quality: { property: "transform", scope: "hero" }
      },
      {
        id: "motion.timeline",
        required: false,
        quality: { property: "transform", scope: "hero" }
      }
    ]);
  });

  it("accepts a zero provider limit for native-only routing", () => {
    expect(
      parseRouteOptions([
        "--capability",
        "platform.css-transition",
        "--max-providers",
        "0"
      ]).maxProviders
    ).toBe(0);
  });

  it("rejects missing capabilities, invalid limits, and unknown flags", () => {
    expect(() => parseRouteOptions([])).toThrow("at least one capability");
    expect(() =>
      parseRouteOptions([
        "--capability",
        "motion.timeline",
        "--max-providers",
        "1.5"
      ])
    ).toThrow("non-negative integer");
    expect(() =>
      parseRouteOptions([
        "--capability",
        "motion.timeline",
        "--max-providers=-1"
      ])
    ).toThrow("non-negative integer");
    expect(() =>
      parseRouteOptions([
        "--capability",
        "motion.timeline",
        "--unknown"
      ])
    ).toThrow();
  });
});

describe("explicit capability route command", () => {
  it("emits a native RoutePlan as canonical JSON", async () => {
    const fixture = await project({ name: "native-app", private: true });
    try {
      const io = captureIo();
      expect(
        runCli({
          argv: [
            "route",
            "--project",
            fixture.root,
            "--capability",
            "platform.css-transition",
            "--json"
          ],
          cwd: repositoryRoot(),
          io: io.io
        })
      ).toBe(0);
      expect(JSON.parse(io.stdout.join(""))).toMatchObject({
        contractKind: "route-plan",
        status: "native",
        selectedProviders: []
      });
      expect(io.stderr).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("selects Motion for a compatible React project", async () => {
    const fixture = await project({
      name: "motion-app",
      private: true,
      dependencies: { react: "19.2.0" }
    });
    try {
      const io = captureIo();
      expect(
        runCli({
          argv: [
            "route",
            "--project",
            fixture.root,
            "--capability",
            "motion.layout",
            "--json"
          ],
          cwd: repositoryRoot(),
          io: io.io
        })
      ).toBe(0);
      expect(JSON.parse(io.stdout.join(""))).toMatchObject({
        status: "selected",
        selectedProviders: [{ providerId: "motion" }]
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("prints a concise human GSAP route", async () => {
    const fixture = await project({ name: "gsap-app", private: true });
    try {
      const io = captureIo();
      expect(
        runCli({
          argv: [
            "route",
            "--project",
            fixture.root,
            "--capability",
            "motion.timeline"
          ],
          cwd: repositoryRoot(),
          io: io.io
        })
      ).toBe(0);
      expect(io.stdout.join(""))
        .toContain("status: selected");
      expect(io.stdout.join(""))
        .toContain("provider: gsap");
    } finally {
      await fixture.cleanup();
    }
  });

  it("returns a blocked plan with exit 0 for an ownership conflict", async () => {
    const fixture = await project({
      name: "conflict-app",
      private: true,
      dependencies: { react: "19.2.0" }
    });
    try {
      const io = captureIo();
      expect(
        runCli({
          argv: [
            "route",
            "--project",
            fixture.root,
            "--capability",
            "motion.layout",
            "--capability",
            "motion.timeline",
            "--scope",
            "hero",
            "--property",
            "transform",
            "--json"
          ],
          cwd: repositoryRoot(),
          io: io.io
        })
      ).toBe(0);
      expect(JSON.parse(io.stdout.join(""))).toMatchObject({
        status: "blocked",
        selectedProviders: []
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("prints a single ROUTE_INPUT_INVALID prefix on stderr", async () => {
    const fixture = await project({ name: "dup-app", private: true });
    try {
      const io = captureIo();
      expect(
        runCli({
          argv: [
            "route",
            "--project",
            fixture.root,
            "--capability",
            "motion.layout",
            "--optional",
            "motion.layout",
            "--json"
          ],
          cwd: repositoryRoot(),
          io: io.io
        })
      ).toBe(1);
      const stderr = io.stderr.join("");
      expect(stderr).toMatch(/^ROUTE_INPUT_INVALID: /);
      expect(stderr).not.toContain("ROUTE_INPUT_INVALID: ROUTE_INPUT_INVALID");
    } finally {
      await fixture.cleanup();
    }
  });

  it("returns exit 2 for invalid route arguments", () => {
    const missing = captureIo();
    expect(
      runCli({ argv: ["route"], cwd: repositoryRoot(), io: missing.io })
    ).toBe(2);
    expect(missing.stderr.join(""))
      .toContain("at least one capability");

    const unknown = captureIo();
    expect(
      runCli({
        argv: ["route", "--capability", "motion.timeline", "--unknown"],
        cwd: repositoryRoot(),
        io: unknown.io
      })
    ).toBe(2);
    expect(unknown.stderr.join(""))
      .toContain("Usage:");
  });

  it("does not write to the routed project", async () => {
    const fixture = await project({ name: "readonly-route", private: true });
    try {
      const before = await readdir(fixture.root);
      const io = captureIo();
      expect(
        runCli({
          argv: [
            "route",
            "--project",
            fixture.root,
            "--capability",
            "platform.css-animation",
            "--json"
          ],
          cwd: repositoryRoot(),
          io: io.io
        })
      ).toBe(0);
      expect(await readdir(fixture.root)).toEqual(before);
    } finally {
      await fixture.cleanup();
    }
  });
});
