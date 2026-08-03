import { describe, expect, it } from "vitest";

import {
  assertNoNulOrEncodingIssues,
  assertPathAllowed,
  assertSafeRelative,
  assertSafeRelativeSync,
  fileDigest,
  pathInsideRoot,
  resolveWithinRoot
} from "../src/path-safety.js";
import { SandboxError } from "../src/types.js";

describe("path-safety", () => {
  describe("assertNoNulOrEncodingIssues", () => {
    it("rejects NUL bytes", () => {
      expect(() => assertNoNulOrEncodingIssues("a\u0000b")).toThrow(SandboxError);
      expect(() => assertNoNulOrEncodingIssues("a\u0000b")).toThrow(
        /NUL byte/
      );
    });

    it("rejects lone surrogates (invalid encoding)", () => {
      expect(() => assertNoNulOrEncodingIssues("a\ud800b")).toThrow(
        SandboxError
      );
      expect(() => assertNoNulOrEncodingIssues("a\udc00b")).toThrow(
        SandboxError
      );
    });

    it("accepts valid paths", () => {
      expect(() => assertNoNulOrEncodingIssues("src/index.ts")).not.toThrow();
    });
  });

  describe("assertSafeRelative", () => {
    it("rejects absolute paths", () => {
      expect(() => assertSafeRelative("/etc/passwd")).toThrow(SandboxError);
      expect(() => assertSafeRelative("C:\\Windows\\system32")).toThrow(
        SandboxError
      );
    });

    it("rejects path traversal", () => {
      expect(() => assertSafeRelative("../secret")).toThrow(SandboxError);
      expect(() => assertSafeRelative("a/../../b")).toThrow(SandboxError);
    });

    it("normalizes backslashes", () => {
      expect(assertSafeRelative("a\\b\\c")).toBe("a/b/c");
    });

    it("accepts safe relative paths", () => {
      expect(assertSafeRelative("src/index.ts")).toBe("src/index.ts");
      expect(assertSafeRelative("./src/index.ts")).toBe("./src/index.ts");
    });
  });

  describe("assertSafeRelativeSync", () => {
    it("rejects absolute and traversal", () => {
      expect(() => assertSafeRelativeSync("/etc")).toThrow(SandboxError);
      expect(() => assertSafeRelativeSync("../x")).toThrow(SandboxError);
    });

    it("accepts safe paths", () => {
      expect(assertSafeRelativeSync("a/b")).toBe("a/b");
    });
  });

  describe("assertPathAllowed", () => {
    it("rejects paths outside writable roots", () => {
      expect(() =>
        assertPathAllowed("outside/file.txt", ["src"], [])
      ).toThrow(SandboxError);
    });

    it("rejects denied paths", () => {
      expect(() =>
        assertPathAllowed("src/secret.txt", ["src"], ["src/secret.txt"])
      ).toThrow(SandboxError);
      expect(() =>
        assertPathAllowed("src/secret.txt/child", ["src"], ["src/secret.txt"])
      ).toThrow(SandboxError);
    });

    it("accepts paths inside writable roots", () => {
      expect(() =>
        assertPathAllowed("src/index.ts", ["src"], [])
      ).not.toThrow();
    });
  });

  describe("resolveWithinRoot", () => {
    it("rejects absolute paths by default", async () => {
      await expect(
        resolveWithinRoot("/etc/passwd", "/tmp/root", {
          allowAbsolutePaths: false,
          denyPaths: []
        })
      ).rejects.toThrow(SandboxError);
    });

    it("rejects traversal", async () => {
      await expect(
        resolveWithinRoot("../escape", "/tmp/root", {
          allowAbsolutePaths: false,
          denyPaths: []
        })
      ).rejects.toThrow(SandboxError);
    });

    it("rejects NUL bytes", async () => {
      await expect(
        resolveWithinRoot("a\u0000b", "/tmp/root", {
          allowAbsolutePaths: false,
          denyPaths: []
        })
      ).rejects.toThrow(SandboxError);
    });
  });

  describe("fileDigest", () => {
    it("produces a sha256 digest", () => {
      const digest = fileDigest(new TextEncoder().encode("hello"));
      expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it("is deterministic", () => {
      const content = new TextEncoder().encode("hello");
      expect(fileDigest(content)).toBe(fileDigest(content));
    });
  });

  describe("pathInsideRoot", () => {
    it("detects containment", () => {
      expect(pathInsideRoot("/tmp/root/a", "/tmp/root")).toBe(true);
      expect(pathInsideRoot("/tmp/root", "/tmp/root")).toBe(true);
      expect(pathInsideRoot("/tmp/other/a", "/tmp/root")).toBe(false);
    });
  });
});