import { describe, expect, it } from "vitest";

import { FakeClock } from "../src/clock.js";
import { MemorySandboxProvider } from "../src/memory-sandbox.js";
import type { SandboxPolicy } from "../src/types.js";
import { SandboxError } from "../src/types.js";

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

const encoder = new TextEncoder();

describe("MemorySandboxSession", () => {
  it("writes and reads files", async () => {
    const provider = new MemorySandboxProvider(new FakeClock());
    const session = await provider.create({
      policy: policy(),
      root: "/sandbox",
      sandboxId: "s1"
    });
    await session.write("src/index.ts", encoder.encode("export const x = 1;"));
    const content = await session.read("src/index.ts");
    expect(new TextDecoder().decode(content)).toBe("export const x = 1;");
    await session.close();
  });

  it("rejects absolute paths", async () => {
    const provider = new MemorySandboxProvider(new FakeClock());
    const session = await provider.create({
      policy: policy(),
      root: "/sandbox",
      sandboxId: "s2"
    });
    await expect(
      session.write("/etc/passwd", encoder.encode("x"))
    ).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("rejects path traversal", async () => {
    const provider = new MemorySandboxProvider(new FakeClock());
    const session = await provider.create({
      policy: policy(),
      root: "/sandbox",
      sandboxId: "s3"
    });
    await expect(
      session.write("../escape", encoder.encode("x"))
    ).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("rejects NUL bytes", async () => {
    const provider = new MemorySandboxProvider(new FakeClock());
    const session = await provider.create({
      policy: policy(),
      root: "/sandbox",
      sandboxId: "s4"
    });
    await expect(
      session.write("a\u0000b", encoder.encode("x"))
    ).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("rejects paths outside writable roots", async () => {
    const provider = new MemorySandboxProvider(new FakeClock());
    const session = await provider.create({
      policy: policy({ writableRoots: ["src"] }),
      root: "/sandbox",
      sandboxId: "s5"
    });
    await expect(
      session.write("outside/file.txt", encoder.encode("x"))
    ).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("rejects denied paths", async () => {
    const provider = new MemorySandboxProvider(new FakeClock());
    const session = await provider.create({
      policy: policy({ denyPaths: ["src/secret.txt"] }),
      root: "/sandbox",
      sandboxId: "s6"
    });
    await expect(
      session.write("src/secret.txt", encoder.encode("x"))
    ).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("enforces file limit", async () => {
    const provider = new MemorySandboxProvider(new FakeClock());
    const session = await provider.create({
      policy: policy({ maxFiles: 2 }),
      root: "/sandbox",
      sandboxId: "s7"
    });
    await session.write("a.txt", encoder.encode("a"));
    await session.write("b.txt", encoder.encode("b"));
    await expect(
      session.write("c.txt", encoder.encode("c"))
    ).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("enforces byte limit", async () => {
    const provider = new MemorySandboxProvider(new FakeClock());
    const session = await provider.create({
      policy: policy({ maxBytes: 5 }),
      root: "/sandbox",
      sandboxId: "s8"
    });
    await expect(
      session.write("a.txt", encoder.encode("123456"))
    ).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("enforces operation limit", async () => {
    const provider = new MemorySandboxProvider(new FakeClock());
    const session = await provider.create({
      policy: policy({ maxOperations: 2 }),
      root: "/sandbox",
      sandboxId: "s9"
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
    const provider = new MemorySandboxProvider(clock);
    const session = await provider.create({
      policy: policy({ maxDurationSeconds: 1 }),
      root: "/sandbox",
      sandboxId: "s10"
    });
    clock.advance(2000);
    await expect(
      session.write("a.txt", encoder.encode("a"))
    ).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("rejects operations after close", async () => {
    const provider = new MemorySandboxProvider(new FakeClock());
    const session = await provider.create({
      policy: policy(),
      root: "/sandbox",
      sandboxId: "s11"
    });
    await session.close();
    await expect(
      session.write("a.txt", encoder.encode("a"))
    ).rejects.toThrow(SandboxError);
  });

  it("removes files and empty directories", async () => {
    const provider = new MemorySandboxProvider(new FakeClock());
    const session = await provider.create({
      policy: policy(),
      root: "/sandbox",
      sandboxId: "s12"
    });
    await session.write("dir/a.txt", encoder.encode("a"));
    await session.remove("dir/a.txt");
    await session.remove("dir");
    await expect(session.read("dir/a.txt")).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("rejects removing non-empty directories", async () => {
    const provider = new MemorySandboxProvider(new FakeClock());
    const session = await provider.create({
      policy: policy(),
      root: "/sandbox",
      sandboxId: "s13"
    });
    await session.write("dir/a.txt", encoder.encode("a"));
    await expect(session.remove("dir")).rejects.toThrow(SandboxError);
    await session.close();
  });

  it("produces deterministic snapshots", async () => {
    const provider = new MemorySandboxProvider(new FakeClock());
    const session = await provider.create({
      policy: policy(),
      root: "/sandbox",
      sandboxId: "s14"
    });
    await session.write("b.txt", encoder.encode("b"));
    await session.write("a.txt", encoder.encode("a"));
    const snapshot = await session.snapshot();
    expect(snapshot.entries.map((entry) => entry.path)).toEqual([
      ".",
      "a.txt",
      "b.txt"
    ]);
    const snapshot2 = await session.snapshot();
    expect(snapshot.digest).toBe(snapshot2.digest);
    await session.close();
  });

  it("seeds files at creation", async () => {
    const provider = new MemorySandboxProvider(new FakeClock());
    const session = await provider.create({
      policy: policy(),
      root: "/sandbox",
      sandboxId: "s15",
      seed: { "src/seed.txt": encoder.encode("seed") }
    });
    const content = await session.read("src/seed.txt");
    expect(new TextDecoder().decode(content)).toBe("seed");
    await session.close();
  });
});