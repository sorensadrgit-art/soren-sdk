import { execFileSync } from "node:child_process";
import * as fsp from "node:fs/promises";
import type * as FsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    readdir: vi.fn(actual.readdir),
    writeFile: vi.fn(actual.writeFile)
  };
});

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

  if (process.platform === "win32") {
    it("does not require POSIX FIFO support on Windows", () => {
      expect(process.platform).toBe("win32");
    });
  } else {
    it("rejects FIFO special files without replacing them", async () => {
      const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
      const session = await provider.create({
        policy: policy(),
        root: baseDir,
        sandboxId: "t6"
      });
      const fifo = path.join(baseDir, "t6", "fifo");
      execFileSync("mkfifo", [fifo]);

      await expect(session.write("fifo", encoder.encode("x"))).rejects.toMatchObject({
        code: "SANDBOX_SPECIAL_FILE"
      });
      expect((await fsp.lstat(fifo)).isFIFO()).toBe(true);
      await session.close();
    });
  }

  it("rejects symlink entries even when they resolve to a file inside the sandbox", async (context) => {
    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy(),
      root: baseDir,
      sandboxId: "t6-symlinks"
    });
    const sandboxRoot = path.join(baseDir, "t6-symlinks");
    const insideTarget = path.join(sandboxRoot, "inside.txt");
    const outsideTarget = path.join(baseDir, "outside.txt");
    await fsp.writeFile(insideTarget, "inside");
    await fsp.writeFile(outsideTarget, "outside");

    try {
      await fsp.symlink(insideTarget, path.join(sandboxRoot, "inside-link"));
      await fsp.symlink(outsideTarget, path.join(sandboxRoot, "outside-link"));
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "EPERM" || error.code === "EACCES")
      ) {
        context.skip("The host does not permit symlink creation for this test.");
        return;
      }
      throw error;
    }

    await expect(session.write("inside-link", encoder.encode("x"))).rejects.toMatchObject({
      code: "SANDBOX_SYMLINK_ESCAPE"
    });
    await expect(session.write("outside-link", encoder.encode("x"))).rejects.toMatchObject({
      code: "SANDBOX_SYMLINK_ESCAPE"
    });
    expect(await fsp.readFile(insideTarget, "utf8")).toBe("inside");
    expect(await fsp.readFile(outsideTarget, "utf8")).toBe("outside");
    await session.close();
  });

  it("rejects a symlink ancestor even when it resolves inside the sandbox", async (context) => {
    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy(),
      root: baseDir,
      sandboxId: "t6-symlink-ancestor"
    });
    const sandboxRoot = path.join(baseDir, "t6-symlink-ancestor");
    const realDirectory = path.join(sandboxRoot, "real-directory");
    await fsp.mkdir(realDirectory);

    try {
      await fsp.symlink(realDirectory, path.join(sandboxRoot, "linked-directory"));
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "EPERM" || error.code === "EACCES")
      ) {
        context.skip("The host does not permit symlink creation for this test.");
        return;
      }
      throw error;
    }

    await expect(session.write("linked-directory/file.txt", encoder.encode("x"))).rejects.toMatchObject({
      code: "SANDBOX_SYMLINK_ESCAPE"
    });
    await expect(fsp.stat(path.join(realDirectory, "file.txt"))).rejects.toMatchObject({
      code: "ENOENT"
    });
    await session.close();
  });

  it("rejects a write when its target is replaced after initial validation", async () => {
    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy(),
      root: baseDir,
      sandboxId: "t6-write-race"
    });
    const sandboxRoot = path.join(baseDir, "t6-write-race");
    const target = path.join(sandboxRoot, "target.txt");
    const replacement = path.join(sandboxRoot, "replacement.txt");
    await fsp.writeFile(target, "original");
    await fsp.writeFile(replacement, "replacement");

    const actualFs = await vi.importActual<typeof FsPromises>(
      "node:fs/promises"
    );
    const writeFile = vi.mocked(fsp.writeFile);
    writeFile.mockImplementation(async (...args) => {
      if (typeof args[0] === "string" && path.basename(args[0]).startsWith(".soren-sdk-tmp-")) {
        await fsp.rename(replacement, target);
      }
      return actualFs.writeFile(...args);
    });

    await expect(session.write("target.txt", encoder.encode("new"))).rejects.toMatchObject({
      code: "SANDBOX_OPERATION_DENIED"
    });
    writeFile.mockImplementation(actualFs.writeFile);

    expect(await fsp.readFile(target, "utf8")).toBe("replacement");
    expect(
      (await fsp.readdir(sandboxRoot)).filter((name) => name.startsWith(".soren-sdk-tmp-"))
    ).toEqual([]);
    await session.close();
  });

  it("rejects removal when the target is replaced after initial validation", async () => {
    const provider = new TempDirSandboxProvider(new FakeClock(), baseDir);
    const session = await provider.create({
      policy: policy(),
      root: baseDir,
      sandboxId: "t6-remove-race"
    });
    const sandboxRoot = path.join(baseDir, "t6-remove-race");
    const target = path.join(sandboxRoot, "target");
    const replacement = path.join(sandboxRoot, "replacement");
    const outside = path.join(baseDir, "outside");
    await fsp.mkdir(target);
    await fsp.mkdir(replacement);
    await fsp.mkdir(outside);
    await fsp.writeFile(path.join(outside, "keep.txt"), "outside");

    const actualFs = await vi.importActual<typeof FsPromises>(
      "node:fs/promises"
    );
    const readdir = vi.mocked(fsp.readdir);
    readdir.mockImplementation(async (...args) => {
      if (args[0] === target) {
        await fsp.rmdir(target);
        await fsp.rename(replacement, target);
        return [];
      }
      return actualFs.readdir(...args);
    });

    await expect(session.remove("target")).rejects.toMatchObject({
      code: "SANDBOX_OPERATION_DENIED"
    });
    readdir.mockImplementation(actualFs.readdir);

    expect((await fsp.lstat(target)).isDirectory()).toBe(true);
    expect(await fsp.readFile(path.join(outside, "keep.txt"), "utf8")).toBe("outside");
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