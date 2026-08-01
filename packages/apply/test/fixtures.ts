import { createHash } from "node:crypto";
import type { ExecutionPlan, ProjectSnapshot } from "@soren-sdk/contracts";
import type { SandboxPolicy, VcsState } from "@soren-sdk/sandbox";

import { computeApprovalIntegrityDigest, type ApplyApproval } from "../src/index.js";

export const NOW_MS = 1_752_940_000_000; // Fixed deterministic timestamp.
export const EXPIRES_MS = NOW_MS + 3_600_000;

export function fixedClock(): { now(): number } {
  return {
    now() {
      return NOW_MS;
    }
  };
}

export function sampleProjectSnapshot(): ProjectSnapshot {
  return {
    schemaVersion: "1.0.0-draft.1",
    contractKind: "project-snapshot",
    snapshotId: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    createdAt: new Date(NOW_MS).toISOString(),
    root: "/tmp/project",
    revision: { vcs: "git", commit: "abc123", dirty: false },
    packageManager: { name: "pnpm", version: "11", lockfile: "pnpm-lock.yaml", lockfileDigest: null },
    workspace: { isMonorepo: false, packages: [] },
    runtimes: [],
    frameworks: [],
    dependencies: [],
    configurations: [],
    policies: [],
    targets: { browsers: [], runtimes: [] },
    warnings: []
  };
}

export function sampleExecutionPlan(
  overrides: Partial<ExecutionPlan> = {}
): ExecutionPlan {
  const base: ExecutionPlan = {
    schemaVersion: "1.0.0-draft.1",
    contractKind: "execution-plan",
    executionPlanId: "plan_x",
    createdAt: new Date(NOW_MS).toISOString(),
    routePlanId: "route_1",
    mode: "apply",
    immutableDigest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    fileChanges: [
      { operation: "create", path: "src/new.ts", contentDigest: digestContent("export const x = 1;") },
      { operation: "update", path: "src/index.ts", contentDigest: digestContent("export const x = 2;") },
      { operation: "delete", path: "src/old.ts", contentDigest: null }
    ],
    dependencyChanges: [],
    commands: [],
    networkDestinations: [],
    credentials: [],
    rollback: [],
    verification: [],
    approval: { required: true, scopes: ["project-write"] }
  };
  return { ...base, ...overrides };
}

export function sampleApproval(
  overrides: Partial<ApplyApproval> = {}
): ApplyApproval {
  const base: ApplyApproval = {
    schemaVersion: "1.0.0-draft.1",
    contractKind: "apply-approval",
    approvalId: "approval_1",
    executionPlanId: "plan_x",
    executionPlanDigest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    projectSnapshotId: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    policySnapshotId: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    allowedOperations: ["create-file", "replace-file", "delete-file"],
    allowedPaths: ["src"],
    allowedCommandIds: [],
    allowedNetworkHosts: [],
    limits: {
      maxFiles: 10,
      maxBytes: 1024,
      maxOperations: 20,
      maxDurationSeconds: 60
    },
    expiresAt: new Date(EXPIRES_MS).toISOString(),
    approver: { id: "user-1", kind: "user" },
    nonce: "nonce-0000000000000001",
    integrityDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000"
  };
  const merged = { ...base, ...overrides };
  merged.integrityDigest = computeApprovalIntegrityDigest(merged) as ApplyApproval["integrityDigest"];
  return merged;
}

export function sampleSandboxPolicy(overrides: Partial<SandboxPolicy> = {}): SandboxPolicy {
  return {
    schemaVersion: "1.0.0-draft.1",
    contractKind: "sandbox-policy",
    policyId: "policy_1",
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

export function sampleVcsState(overrides: Partial<VcsState> = {}): VcsState {
  return {
    detected: true,
    root: "/tmp/project",
    branch: "feature/x",
    commit: "abc123",
    dirty: false,
    protectedBranch: false,
    reasons: [],
    ...overrides
  };
}

const encoder = new TextEncoder();

export function digestContent(content: string): `sha256:${string}` {
  return contentDigest(encoder.encode(content)) as `sha256:${string}`;
}

export function contentDigest(content: Uint8Array): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export { encoder };