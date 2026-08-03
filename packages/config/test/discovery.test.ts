import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ConfigLoadError,
  MemoryFileSystem,
  NodeFileSystem,
  findSingleSource,
  sorenConfigPaths,
  sorenPolicyPaths,
} from "../src/index.js";

function configRoot(root: string): string {
  return join(root, ".soren-sdk");
}

describe("config file discovery", () => {
  it("returns the yaml source when only yaml exists", () => {
    const fs = new MemoryFileSystem();
    const root = "/project";
    fs.writeFileAtomic(join(root, ".soren-sdk", "config.yaml"), "configId: a\n");

    const found = findSingleSource(fs, sorenConfigPaths(root));
    expect(found).toEqual({
      kind: "config",
      format: "yaml",
      path: join(root, ".soren-sdk", "config.yaml"),
    });
  });

  it("returns the json source when only json exists", () => {
    const fs = new MemoryFileSystem();
    const root = "/project";
    fs.writeFileAtomic(join(root, ".soren-sdk", "config.json"), "{}");

    const found = findSingleSource(fs, sorenConfigPaths(root));
    expect(found).toEqual({
      kind: "config",
      format: "json",
      path: join(root, ".soren-sdk", "config.json"),
    });
  });

  it("throws CONFIG_AMBIGUOUS when both variants exist", () => {
    const fs = new MemoryFileSystem();
    const root = "/project";
    fs.writeFileAtomic(join(root, ".soren-sdk", "config.yaml"), "configId: a\n");
    fs.writeFileAtomic(join(root, ".soren-sdk", "config.json"), "{}");

    try {
      findSingleSource(fs, sorenConfigPaths(root));
      throw new Error("expected CONFIG_AMBIGUOUS");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigLoadError);
      expect((error as ConfigLoadError).code).toBe("CONFIG_AMBIGUOUS");
    }
  });

  it("returns undefined when no source exists", () => {
    const fs = new MemoryFileSystem();
    expect(findSingleSource(fs, sorenPolicyPaths("/project"))).toBeUndefined();
  });

  it("lists policy candidates under .soren-sdk", () => {
    const candidates = sorenPolicyPaths("/project");
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.format)).toEqual(["yaml", "json"]);
    expect(candidates.every((c) => c.path.startsWith(configRoot("/project")))).toBe(
      true
    );
  });
});

describe("MemoryFileSystem", () => {
  let fs: MemoryFileSystem;
  beforeEach(() => {
    fs = new MemoryFileSystem();
  });

  it("readFile returns content after writeFileAtomic", () => {
    fs.writeFileAtomic("/project/.soren-sdk/config.yaml", "configId: a\n");
    expect(fs.readFile("/project/.soren-sdk/config.yaml")).toBe("configId: a\n");
    expect(fs.exists("/project/.soren-sdk/config.yaml")).toBe(true);
  });

  it("readFile returns undefined for missing files", () => {
    expect(fs.readFile("/nope")).toBeUndefined();
    expect(fs.exists("/nope")).toBe(false);
  });

  it("realpath resolves dot segments lexically", () => {
    fs.writeFileAtomic("/project/.soren-sdk/config.yaml", "");
    expect(fs.realpath("/project/./.soren-sdk/../.soren-sdk/config.yaml")).toBe(
      "/project/.soren-sdk/config.yaml"
    );
  });

  it("realpath throws ENOENT for missing paths", () => {
    expect(() => fs.realpath("/missing/file")).toThrowError(/ENOENT/);
  });

  it("isSymbolicLink honors the symlinks set", () => {
    const linked = new MemoryFileSystem({ symlinks: new Set(["/link"]) });
    expect(linked.isSymbolicLink("/link")).toBe(true);
    expect(linked.isSymbolicLink("/not-a-link")).toBe(false);
  });
});

describe("NodeFileSystem", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "soren-config-test-"));
    // writeFileAtomic intentionally does not create parent directories.
    mkdirSync(join(dir, ".soren-sdk"), { recursive: true });
  });
  afterEach(() => {});

  it("atomic write creates the file and leaves no temp file", () => {
    const target = join(dir, ".soren-sdk", "config.yaml");
    const fs = new NodeFileSystem();
    fs.writeFileAtomic(target, "configId: a\n");

    expect(readFileSync(target, "utf8")).toBe("configId: a\n");
    const leftovers = readdirSync(join(dir, ".soren-sdk")).filter((name) =>
      name.includes(".tmp-")
    );
    expect(leftovers).toEqual([]);
  });

  it("atomic write overwrites existing content via rename", () => {
    const target = join(dir, ".soren-sdk", "config.yaml");
    const fs = new NodeFileSystem();
    fs.writeFileAtomic(target, "first\n");
    fs.writeFileAtomic(target, "second\n");
    expect(readFileSync(target, "utf8")).toBe("second\n");
  });

  it("readFile returns undefined for missing files", () => {
    expect(new NodeFileSystem().readFile(join(dir, "missing.yaml"))).toBeUndefined();
  });

  it("reports symlink status via lstat", () => {
    writeFileSync(join(dir, "target.txt"), "x");
    const fs = new NodeFileSystem();
    expect(fs.isSymbolicLink(join(dir, "target.txt"))).toBe(false);
  });
});
