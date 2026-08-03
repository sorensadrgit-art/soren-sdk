import {
  lstatSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";

/**
 * Minimal, injectable file-system surface used by config discovery, loading,
 * and lockfile writing. `NodeFileSystem` wraps `node:fs`; `MemoryFileSystem`
 * backs in-memory fixtures and tests.
 */
export interface FileSystemAdapter {
  readFile(path: string): string | undefined;
  exists(path: string): boolean;
  realpath(path: string): string;
  isSymbolicLink(path: string): boolean;
  writeFileAtomic(path: string, content: string): void;
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** Real file-system adapter backed by `node:fs`. */
export class NodeFileSystem implements FileSystemAdapter {
  readFile(path: string): string | undefined {
    try {
      return readFileSync(path, "utf8");
    } catch (error) {
      if (isEnoent(error)) {
        return undefined;
      }
      throw error;
    }
  }

  exists(path: string): boolean {
    try {
      lstatSync(path);
      return true;
    } catch (error) {
      if (isEnoent(error)) {
        return false;
      }
      throw error;
    }
  }

  realpath(path: string): string {
    return realpathSync.native(path);
  }

  isSymbolicLink(path: string): boolean {
    try {
      return lstatSync(path).isSymbolicLink();
    } catch (error) {
      if (isEnoent(error)) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Write to a temporary sibling file and rename over the target so readers
   * never observe a partially written file. Does not create parent
   * directories.
   */
  writeFileAtomic(path: string, content: string): void {
    const tempPath = `${path}.tmp-${process.pid}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    writeFileSync(tempPath, content, "utf8");
    renameSync(tempPath, path);
  }
}

/** Resolve `.`/`..` segments lexically (POSIX-style). */
function resolveLexically(path: string): string {
  const absolute = path.startsWith("/");
  const parts = path.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  const joined = out.join("/");
  return absolute ? `/${joined}` : joined;
}

/**
 * In-memory file-system adapter for tests and fixtures. Supports an optional
 * set of paths to simulate as symbolic links.
 */
export class MemoryFileSystem implements FileSystemAdapter {
  readonly #files: Map<string, string>;
  readonly #symlinks: ReadonlySet<string>;

  constructor(options?: { files?: Map<string, string>; symlinks?: Set<string> }) {
    this.#files = new Map(options?.files ?? []);
    this.#symlinks = new Set(options?.symlinks ?? []);
  }

  readFile(path: string): string | undefined {
    return this.#files.get(path);
  }

  exists(path: string): boolean {
    return this.#files.has(path) || this.#symlinks.has(path);
  }

  realpath(path: string): string {
    const resolved = resolveLexically(path);
    if (!this.exists(resolved)) {
      throw new Error(`ENOENT: no such file or directory, realpath '${resolved}'`);
    }
    return resolved;
  }

  isSymbolicLink(path: string): boolean {
    return this.#symlinks.has(path);
  }

  writeFileAtomic(path: string, content: string): void {
    this.#files.set(path, content);
  }

  get files(): ReadonlyMap<string, string> {
    return this.#files;
  }
}
