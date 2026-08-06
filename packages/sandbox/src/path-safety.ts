import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

import type { Digest } from "@soren-sdk/contracts";

import { SandboxError } from "./types.js";

const NUL = /[\u0000]/u;

/**
 * Validate a single path segment against NUL bytes and invalid encodings.
 */
export function assertNoNulOrEncodingIssues(p: string): void {
  if (NUL.test(p)) {
    throw new SandboxError("SANDBOX_NUL_BYTE", `Path contains a NUL byte: ${displayPath(p)}`);
  }
  if (!isValidUtf8Path(p)) {
    throw new SandboxError(
      "SANDBOX_INVALID_ENCODING",
      `Path is not valid UTF-8: ${displayPath(p)}`
    );
  }
}

function isValidUtf8Path(p: string): boolean {
  // In Node, strings are already UTF-16; check for lone surrogates which
  // indicate truncated or invalid encodings from underlying buffers.
  for (let i = 0; i < p.length; i += 1) {
    const code = p.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdfff) {
      const isHigh = code <= 0xdbff;
      const next = p.charCodeAt(i + 1);
      if (isHigh) {
        if (next < 0xdc00 || next > 0xdfff) return false;
        i += 1;
      } else {
        return false;
      }
    }
  }
  return true;
}

function displayPath(p: string): string {
  // Never echo raw bytes that may contain secrets or control characters into
  // logs; redact to a portable representation.
  return JSON.stringify(p);
}

/**
 * Reject absolute paths unless the policy explicitly permits them.
 */
export function assertNotAbsolute(p: string): void {
  if (path.isAbsolute(p) || /^[a-zA-Z]:[\\/]/.test(p)) {
    throw new SandboxError("SANDBOX_ABSOLUTE_PATH", `Absolute path rejected: ${displayPath(p)}`, {
      path: p
    });
  }
}

/**
 * Reject path traversal (`..` segments) and empty path segments that imply
 * traversal semantics.
 */
export function assertSafeRelative(p: string): string {
  assertNoNulOrEncodingIssues(p);
  const normalized = p.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    throw new SandboxError("SANDBOX_ABSOLUTE_PATH", `Absolute path rejected: ${displayPath(p)}`, {
      path: p
    });
  }
  const segments = normalized.split("/");
  if (segments.includes("..")) {
    throw new SandboxError("SANDBOX_PATH_TRAVERSAL", `Path traversal rejected: ${displayPath(p)}`, {
      path: p
    });
  }
  return normalized;
}

/**
 * Resolve a candidate path inside a sandbox root. The caller must pass a
 * policy-relative path; this function returns the fully resolved real path
 * on disk and verifies it stays within the sandbox root.
 *
 * Performs:
 *  - NUL / encoding checks
 *  - Absolute-path rejection (unless policy allows)
 *  - `..` traversal rejection
 *  - Symlink resolution + recheck ("race recheck" before every mutation)
 *  - Deny-path checks
 */
export async function resolveWithinRoot(
  candidate: string,
  root: string,
  policy: {
    allowAbsolutePaths: boolean;
    denyPaths: string[];
  }
): Promise<string> {
  assertNoNulOrEncodingIssues(candidate);
  if (candidate === "") {
    throw new SandboxError("SANDBOX_PATH_TRAVERSAL", "Empty path rejected.", { path: "" });
  }

  if (path.isAbsolute(candidate) || /^[a-zA-Z]:[\\/]/.test(candidate)) {
    if (!policy.allowAbsolutePaths) {
      throw new SandboxError("SANDBOX_ABSOLUTE_PATH", `Absolute path rejected: ${displayPath(candidate)}`, {
        path: candidate
      });
    }
    // An explicitly permitted absolute path must still resolve inside root.
    const realAbsolute = await resolveReal(candidate, root);
    return realAbsolute;
  }

  const normalized = candidate.replaceAll("\\", "/");
  const segments = normalized.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.includes("..")) {
    throw new SandboxError("SANDBOX_PATH_TRAVERSAL", `Path traversal rejected: ${displayPath(candidate)}`, {
      path: candidate
    });
  }

  const joined = path.resolve(root, ...segments);
  const real = await resolveReal(joined, root);
  return real;
}

async function resolveReal(target: string, root: string): Promise<string> {
  const realRoot = await realPathSafe(root);
  let realTarget: string;
  try {
    realTarget = await fsp.realpath(target);
  } catch {
    // The target may not exist yet (create operations). Resolve the deepest
    // existing ancestor and append the remaining segments, then recheck.
    realTarget = await resolveWithDeepestExistingAncestor(target, realRoot);
  }

  if (!isInside(realTarget, realRoot)) {
    throw new SandboxError(
      "SANDBOX_SYMLINK_ESCAPE",
      `Symlink escape detected: ${displayPath(target)} resolves outside the sandbox root.`,
      { path: target }
    );
  }
  return realTarget;
}

function isInside(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function realPathSafe(p: string): Promise<string> {
  try {
    return await fsp.realpath(p);
  } catch {
    // Root may not exist yet in tests; fall back to a normalized absolute path.
    return path.resolve(p);
  }
}

async function resolveWithDeepestExistingAncestor(
  target: string,
  root: string
): Promise<string> {
  let current = target;
  const tail: string[] = [];
  for (let depth = 0; depth < 256; depth += 1) {
    try {
      const real = await fsp.realpath(current);
      const full = path.join(real, ...tail.reverse());
      if (!isInside(full, root)) {
        throw new SandboxError(
          "SANDBOX_SYMLINK_ESCAPE",
          `Symlink escape detected via ancestor: ${displayPath(target)}.`,
          { path: target }
        );
      }
      return full;
    } catch (error) {
      if (error instanceof SandboxError) throw error;
      const parent = path.dirname(current);
      if (parent === current) {
        return path.join(root, ...tail.reverse());
      }
      tail.push(path.basename(current));
      current = parent;
    }
  }
  throw new SandboxError("SANDBOX_PATH_TRAVERSAL", "Path nesting too deep.", { path: target });
}

/**
 * Reject special files (devices, sockets, FIFOs) and symlinks that the
 * policy does not allow. Regular files and directories are permitted.
 */
export async function assertRegularFileOrDirectory(
  target: string,
  policy: { allowSpecialFiles: boolean; allowSymlinkEscapes: boolean }
): Promise<void> {
  let stat: Awaited<ReturnType<typeof fsp.lstat>>;
  try {
    stat = await fsp.lstat(target);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      // Missing targets are allowed for create operations.
      return;
    }
    throw error;
  }

  if (stat.isSymbolicLink()) {
    if (!policy.allowSymlinkEscapes) {
      throw new SandboxError("SANDBOX_SYMLINK_ESCAPE", `Symlink rejected: ${displayPath(target)}`, {
        path: target
      });
    }
    return;
  }

  if (!stat.isFile() && !stat.isDirectory()) {
    throw new SandboxError(
      "SANDBOX_SPECIAL_FILE",
      `Special file rejected (devices, sockets, FIFOs are not allowed): ${displayPath(target)}`,
      { path: target }
    );
  }
}

/**
 * Reject symlinks that escape the sandbox root. Used as a recheck before
 * every mutation to close TOCTOU races.
 */
export async function assertNoSymlinkEscape(
  target: string,
  root: string,
  policy: { allowSymlinkEscapes: boolean }
): Promise<void> {
  if (policy.allowSymlinkEscapes) return;
  const real = await resolveWithinRoot(target, root, {
    allowAbsolutePaths: false,
    denyPaths: []
  });
  if (!isInside(real, await realPathSafe(root))) {
    throw new SandboxError("SANDBOX_SYMLINK_ESCAPE", `Symlink escape rejected: ${displayPath(target)}`, {
      path: target
    });
  }
}

/**
 * Validate an output path against deny patterns and writable roots.
 */
export function assertPathAllowed(
  candidate: string,
  writableRoots: string[],
  denyPaths: string[]
): void {
  assertNoNulOrEncodingIssues(candidate);
  const normalized = candidate.replaceAll("\\", "/");
  for (const deny of denyPaths) {
    const denyNormalized = deny.replaceAll("\\", "/");
    if (
      normalized === denyNormalized ||
      normalized.startsWith(`${denyNormalized}/`)
    ) {
      throw new SandboxError("SANDBOX_OPERATION_DENIED", `Path denied by policy: ${displayPath(candidate)}`, {
        path: candidate
      });
    }
  }

  const insideWritableRoot = writableRoots.some((rootPath) => {
    const root = rootPath.replaceAll("\\", "/");
    // "." means the sandbox root itself: every path within it is allowed.
    if (root === ".") return true;
    return normalized === root || normalized.startsWith(`${root}/`);
  });
  if (!insideWritableRoot) {
    throw new SandboxError("SANDBOX_OPERATION_DENIED", `Path outside writable roots: ${displayPath(candidate)}`, {
      path: candidate
    });
  }
}

/**
 * Sync variant used by deterministic seeds/teardown.
 */
export function assertSafeRelativeSync(p: string): string {
  assertNoNulOrEncodingIssues(p);
  const normalized = p.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    throw new SandboxError("SANDBOX_ABSOLUTE_PATH", `Absolute path rejected: ${displayPath(p)}`, {
      path: p
    });
  }
  if (normalized.split("/").includes("..")) {
    throw new SandboxError("SANDBOX_PATH_TRAVERSAL", `Path traversal rejected: ${displayPath(p)}`, {
      path: p
    });
  }
  return normalized;
}

/**
 * Check that a path is inside a root (portable, no realpath).
 */
export function pathInsideRoot(p: string, root: string): boolean {
  const relative = path.relative(root, p);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function fileDigest(content: Uint8Array): Digest {
  return `sha256:${stableHash(content)}`;
}

function stableHash(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

// Re-export `fs` for callers that need sync path helpers.
export { fs };
