import { execSync } from "node:child_process";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeClock } from "../src/clock.js";
import { TempDirSandboxProvider } from "../src/temp-dir-sandbox.js";
import type { SandboxPolicy } from "../src/types.js";
import { SandboxError } from "../src/types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function policy(overrides: Partial<SandboxPolicy> = {}): SandboxPolicy {
  return {
    schemaVersion: "1.0.0-draft.1",
    contractKind: "sandbox-policy",
    policyId: "test-policy",
    allowAbsolutePaths: false,
    allowSymlinkEscapes: false,
    allowSpecialFiles: false,
    allowCommands: false,
    allowNetwork: false,
    maxFiles: 10,
    maxBytes: 1024,
    maxOperations: 20,
    maxDurationSeconds: 60,
    writableRoots: ["."],
    denyPaths: [],
    ...overrides
  };
}

let baseDir: string;

beforeEach(async () => {
  baseDir = path.join(os.tmpdir(), `soren-sdk-test-${Date.now()}-${Math.random()}`);
  await fsp.mkdir(baseDir, { recursive: true });
});

afterEach(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true });
});

describe("TempDirSandboxSession", () => {
  it("writes and reads files atomically", async () => {
    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy(),
      root: baseDir,
      sandboxId: "t1"
    });
    await session.write("src/index.ts", encoder.encode("export const x = 1;"));
    const content = await session.read("src/index.ts");
    expect(decoder.decode(content)).toBe("export const x = 1;");
    await session.close();
  });

  it("rejects absolute paths", async () => {
    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy(),
      root: baseDir,
      sandboxId: "t2"
    });
    await expect(
      session.write("/etc/passwd", encoder.encode("x"))
    ).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("rejects path traversal", async () => {
    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy(),
      root: baseDir,
      sandboxId: "t3"
    });
    await expect(
      session.write("../escape", encoder.encode("x"))
    ).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("rejects NUL bytes", async () => {
    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy(),
      root: baseDir,
      sandboxId: "t4"
    });
    await expect(
      session.write("a\u0000b", encoder.encode("x"))
    ).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("rejects symlink escapes", async () => {
    const outside = path.join(baseDir, "outside");
    await fsp.mkdir(outside, { recursive: true });
    await fsp.writeFile(path.join(outside, "secret.txt"), "secret");

    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy(),
      root: baseDir,
      sandboxId: "t5"
    });
    // Create a symlink inside the sandbox that points outside the sandbox root.
    await fsp.symlink(outside, path.join(baseDir, "t5", "link"));
    await expect(
      session.write("link/secret.txt", encoder.encode("x"))
    ).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("rejects special files", async () => {
    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy(),
      root: baseDir,
      sandboxId: "t6"
    });
    // FIFO is a special file. Create it inside the sandbox root.
    const fifo = path.join(baseDir, "t6", "fifo");
    execSync(`mkfifo "${fifo}"`);
    await expect(
      session.write("fifo", encoder.encode("x"))
    ).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("enforces file limit", async () => {
    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy({ maxFiles: 2 }),
      root: baseDir,
      sandboxId: "t7"
    });
    await session.write("a.txt", encoder.encode("a"));
    await session.write("b.txt", encoder.encode("b"));
    await expect(
      session.write("c.txt", encoder.encode("c"))
    ).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("enforces byte limit", async () => {
    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy({ maxBytes: 5 }),
      root: baseDir,
      sandboxId: "t8"
    });
    await expect(
      session.write("a.txt", encoder.encode("123456"))
    ).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("enforces operation limit", async () => {
    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy({ maxOperations: 2 }),
      root: baseDir,
      sandboxId: "t9"
    });
    await session.write("a.txt", encoder.encode("a"));
    await session.write("b.txt", encoder.encode("b"));
    await expect(
      session.write("c.txt", encoder.encode("c"))
    ).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("enforces time limit", async () => {
    const clock = new FakeClock();
    const provider = new TempDirSandboxProvider(clock, baseDir);
    const session = await provider.create({
      policy: policy({ maxDurationSeconds: 1 }),
      root: baseDir,
      sandboxId: "t10"
    });
    clock.advance(2000);
    await expect(
      session.write("a.txt", encoder.encode("a"))
    ).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("rejects operations after close", async () => {
    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy(),
      root: baseDir,
      sandboxId: "t11"
    });
    await session.close();
    await expect(
      session.write("a.txt", encoder.encode("a"))
    ).rejects.toThrow(SandboxError);
  });

  it("removes files and empty directories", async () => {
    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy(),
      root: baseDir,
      sandboxId: "t12"
    });
    await session.write("dir/a.txt", encoder.encode("a"));
    await session.remove("dir/a.txt");
    await session.remove("dir");
    await expect(session.read("dir/a.txt")).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("rejects removing non-empty directories", async () => {
    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy(),
      root: baseDir,
      sandboxId: "t13"
    });
    await session.write("dir/a.txt", encoder.encode("a"));
    await expect(session.remove("dir")).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("produces deterministic snapshots", async () => {
    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy(),
      root: baseDir,
      sandboxId: "t14"
    });
    await session.write("b.txt", encoder.encode("b"));
    await session.write("a.txt", encoder.encode("a"));
    const snapshot = await session.snapshot();
    const snapshot2 = await session.snapshot();
    expect(snapshot.digest).toBe(snapshot2.digest);
    await session.close();
  });

  it("seeds files at creation", async () => {
    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy(),
      root: baseDir,
      sandboxId: "t15",
      seed: { "src/seed.txt": encoder.encode("seed") }
    });
    const content = await session.read("src/seed.txt");
    expect(decoder.decode(content)).toBe("seed");
    await session.close();
  });

  it("does not touch the original tree", async () => {
    const original = path.join(baseDir, "original");
    await fsp.mkdir(original, { recursive: true });
    await fsp.writeFile(path.join(original, "keep.txt"), "original");

    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy(),
      root: baseDir,
      sandboxId: "t16"
    });
    await session.write("new.txt", encoder.encode("new"));
    await session.close();

    const originalContent = await fsp.readFile(path.join(original, "keep.txt"), "utf8");
    expect(originalContent).toBe("original");
  });
});