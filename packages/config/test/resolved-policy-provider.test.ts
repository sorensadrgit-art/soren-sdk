import { describe, expect, it } from "vitest";
import type { PolicyDocument } from "@soren-sdk/contracts";
import {
  BUILTIN_POLICY,
  MemoryFileSystem,
  MemoryResolvedPolicyProvider,
  ResolvedPolicyMissingError,
  policyFingerprint,
  type ResolvePolicyInput,
  type ResolvedPolicy,
} from "../src/index.js";

function samplePolicy(): ResolvedPolicy {
  const document: PolicyDocument = {
    ...BUILTIN_POLICY,
    policyId: "resolved-abc12345",
    scope: "run",
  };
  return {
    snapshotId: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    document,
    effective: document.rules,
    decisions: [],
    layers: [{ scope: "builtin", policyId: "builtin-hard-safety", source: null }],
  };
}

function sampleInput(overrides: Partial<ResolvePolicyInput> = {}): ResolvePolicyInput {
  return {
    projectRoot: "/workspace/app",
    fs: new MemoryFileSystem(),
    workspaceRoot: "/workspace",
    ...overrides,
  };
}

describe("ResolvedPolicyProvider", () => {
  it("is importable without any filesystem adapter", () => {
    // The provider is a pure in-memory port; constructing it and resolving a
    // preloaded fingerprint must not require NodeFileSystem or disk access.
    const provider = new MemoryResolvedPolicyProvider(new Map());
    expect(provider).toBeDefined();
  });

  it("returns the preloaded policy for a known fingerprint", () => {
    const policy = samplePolicy();
    const input = sampleInput({
      organizationPolicy: { ...BUILTIN_POLICY, policyId: "org-policy", scope: "organization" },
    });
    const fingerprint = policyFingerprint(input);
    const provider = new MemoryResolvedPolicyProvider(
      new Map([[fingerprint, policy]])
    );

    const resolved = provider.getResolvedPolicy(input);
    expect(resolved).toBe(policy);
  });

  it("throws POLICY_SNAPSHOT_MISSING for an unknown fingerprint", () => {
    const provider = new MemoryResolvedPolicyProvider(new Map());
    try {
      provider.getResolvedPolicy(sampleInput());
      throw new Error("expected ResolvedPolicyMissingError");
    } catch (error) {
      expect(error).toBeInstanceOf(ResolvedPolicyMissingError);
      expect((error as ResolvedPolicyMissingError).code).toBe(
        "POLICY_SNAPSHOT_MISSING"
      );
    }
  });

  it("fingerprints differ when the projectRoot changes", () => {
    const a = policyFingerprint(sampleInput({ projectRoot: "/a" }));
    const b = policyFingerprint(sampleInput({ projectRoot: "/b" }));
    expect(a).not.toBe(b);
  });

  it("fingerprints are stable for identical inputs", () => {
    const a = policyFingerprint(sampleInput());
    const b = policyFingerprint(sampleInput());
    expect(a).toBe(b);
  });
});
