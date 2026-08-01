import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PolicyDocument } from "@soren-sdk/contracts";
import {
  MemoryFileSystem,
  PolicyResolutionError,
  PolicyResolver,
  type ResolvePolicyInput,
  type ResolvedPolicy,
} from "../src/index.js";

function policy(
  scope: PolicyDocument["scope"],
  policyId: string,
  overrides: Partial<PolicyDocument["rules"]> = {}
): PolicyDocument {
  return {
    schemaVersion: "1.0.0-draft.1",
    contractKind: "policy",
    policyId,
    version: "1.0.0",
    scope,
    rules: {
      allowedConnectors: [],
      deniedConnectors: [],
      allowExperimental: false,
      allowedLicenses: [],
      allowPaidServices: false,
      network: { mode: "deny", allowedHosts: [] },
      filesystem: { read: [], write: [] },
      allowRemoteProjectContent: false,
      maxBundleKilobytes: null,
      requireReducedMotion: true,
      requiredApprovals: [],
      ...overrides,
    },
  };
}

function writeProjectPolicy(
  fs: MemoryFileSystem,
  document: PolicyDocument
): void {
  fs.writeFileAtomic(
    join("/workspace/app", ".soren-sdk", "policy.json"),
    JSON.stringify(document)
  );
}

function writeWorkspacePolicy(
  fs: MemoryFileSystem,
  document: PolicyDocument
): void {
  fs.writeFileAtomic(
    join("/workspace", ".soren-sdk", "policy.json"),
    JSON.stringify(document)
  );
}

function resolve(
  fs: MemoryFileSystem,
  overrides: Partial<ResolvePolicyInput> = {}
): ResolvedPolicy {
  const resolver = new PolicyResolver();
  return resolver.resolve({
    projectRoot: "/workspace/app",
    fs,
    workspaceRoot: "/workspace",
    ...overrides,
  });
}

function weakenError(fn: () => unknown): PolicyResolutionError {
  try {
    fn();
    throw new Error("expected PolicyResolutionError");
  } catch (error) {
    expect(error).toBeInstanceOf(PolicyResolutionError);
    return error as PolicyResolutionError;
  }
}

describe("PolicyResolver baseline", () => {
  it("applies the builtin hard-safety baseline when no layers exist", () => {
    const resolved = resolve(new MemoryFileSystem());
    expect(resolved.effective.allowedConnectors).toEqual([]);
    expect(resolved.effective.allowExperimental).toBe(false);
    expect(resolved.effective.allowPaidServices).toBe(false);
    expect(resolved.effective.network.mode).toBe("deny");
    expect(resolved.effective.filesystem.write).toEqual([]);
    expect(resolved.effective.requireReducedMotion).toBe(true);
    expect(resolved.effective.maxBundleKilobytes).toBeNull();
    expect(resolved.layers.map((layer) => layer.scope)).toEqual(["builtin"]);
  });

  it("produces a deterministic snapshotId", () => {
    const a = resolve(new MemoryFileSystem());
    const b = resolve(new MemoryFileSystem());
    expect(a.snapshotId).toBe(b.snapshotId);
    expect(a.snapshotId).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("PolicyResolver layer precedence", () => {
  it("includes workspace and project layers in order", () => {
    const fs = new MemoryFileSystem();
    writeWorkspacePolicy(fs, policy("workspace", "workspace-policy"));
    writeProjectPolicy(fs, policy("project", "project-policy"));
    const resolved = resolve(fs);
    expect(resolved.layers.map((layer) => layer.scope)).toEqual([
      "builtin",
      "workspace",
      "project",
    ]);
  });

  it("a project layer can tighten the builtin allowlist", () => {
    const fs = new MemoryFileSystem();
    writeProjectPolicy(fs, policy("project", "project-policy", {
      allowedConnectors: ["web-platform"],
    }));
    const resolved = resolve(fs);
    expect(resolved.effective.allowedConnectors).toEqual(["web-platform"]);
    const decision = resolved.decisions.find(
      (d) => d.field === "allowedConnectors"
    );
    expect(decision?.layer).toBe("project");
    expect(decision?.sourcePolicyId).toBe("project-policy");
  });

  it("org deny cannot be re-allowed by a project layer", () => {
    const fs = new MemoryFileSystem();
    writeProjectPolicy(fs, policy("project", "project-policy", {
      allowedConnectors: ["gsap"],
    }));
    const error = weakenError(() =>
      resolve(fs, {
        organizationPolicy: policy("organization", "org-policy", {
          deniedConnectors: ["gsap"],
        }),
      })
    );
    expect(error.code).toBe("POLICY_WEAKENING_DENIED");
  });

  it("rejects a higher layer expanding a lower allowlist", () => {
    const fs = new MemoryFileSystem();
    writeWorkspacePolicy(fs, policy("workspace", "workspace-policy", {
      allowedConnectors: ["web-platform"],
    }));
    writeProjectPolicy(fs, policy("project", "project-policy", {
      allowedConnectors: ["web-platform", "motion"],
    }));
    const error = weakenError(() => resolve(fs));
    expect(error.code).toBe("POLICY_WEAKENING_DENIED");
    expect(error.field).toBe("allowedConnectors");
  });

  it("allowlists narrow to the subset across layers", () => {
    const fs = new MemoryFileSystem();
    writeWorkspacePolicy(fs, policy("workspace", "workspace-policy", {
      allowedConnectors: ["web-platform", "motion"],
      allowedLicenses: ["MIT"],
    }));
    writeProjectPolicy(fs, policy("project", "project-policy", {
      allowedConnectors: ["web-platform"],
    }));
    const resolved = resolve(fs);
    expect(resolved.effective.allowedConnectors).toEqual(["web-platform"]);
    expect(resolved.effective.allowedLicenses).toEqual(["MIT"]);
  });
});

describe("PolicyResolver booleans", () => {
  it("allows tightening allowExperimental true -> false", () => {
    const fs = new MemoryFileSystem();
    writeProjectPolicy(fs, policy("project", "p", {
      allowExperimental: false,
      allowPaidServices: false,
      allowRemoteProjectContent: false,
    }));
    const resolved = resolve(fs);
    expect(resolved.effective.allowExperimental).toBe(false);
    expect(resolved.effective.allowPaidServices).toBe(false);
    expect(resolved.effective.allowRemoteProjectContent).toBe(false);
  });

  it("rejects loosening allowExperimental false -> true", () => {
    const fs = new MemoryFileSystem();
    writeProjectPolicy(fs, policy("project", "p", { allowExperimental: true }));
    const error = weakenError(() => resolve(fs));
    expect(error.code).toBe("POLICY_WEAKENING_DENIED");
    expect(error.field).toBe("allowExperimental");
  });

  it("rejects loosening requireReducedMotion true -> false", () => {
    const fs = new MemoryFileSystem();
    writeProjectPolicy(fs, policy("project", "p", { requireReducedMotion: false }));
    const error = weakenError(() => resolve(fs));
    expect(error.code).toBe("POLICY_WEAKENING_DENIED");
    expect(error.field).toBe("requireReducedMotion");
  });
});

describe("PolicyResolver network", () => {
  it("accepts a layer matching the builtin deny mode", () => {
    const fs = new MemoryFileSystem();
    writeProjectPolicy(fs, policy("project", "p", {
      network: { mode: "deny", allowedHosts: [] },
    }));
    expect(resolve(fs).effective.network.mode).toBe("deny");
  });

  it("rejects loosening network.mode", () => {
    const fs = new MemoryFileSystem();
    writeProjectPolicy(fs, policy("project", "p", {
      network: { mode: "unrestricted", allowedHosts: [] },
    }));
    const error = weakenError(() => resolve(fs));
    expect(error.code).toBe("POLICY_WEAKENING_DENIED");
    expect(error.field).toBe("network.mode");
  });

  it("rejects non-empty allowedHosts while network mode is deny", () => {
    const fs = new MemoryFileSystem();
    writeProjectPolicy(fs, policy("project", "p", {
      network: { mode: "deny", allowedHosts: ["api.example.com"] },
    }));
    const error = weakenError(() => resolve(fs));
    expect(error.code).toBe("POLICY_INVALID");
    expect(error.field).toBe("network.allowedHosts");
  });
});

describe("PolicyResolver filesystem and bundle", () => {
  it("allows shrinking filesystem.write", () => {
    const fs = new MemoryFileSystem();
    writeWorkspacePolicy(fs, policy("workspace", "w", {
      filesystem: { read: ["project"], write: ["project/dist", "project/tmp"] },
    }));
    writeProjectPolicy(fs, policy("project", "p", {
      filesystem: { read: ["project"], write: ["project/dist"] },
    }));
    const resolved = resolve(fs);
    expect(resolved.effective.filesystem.write).toEqual(["project/dist"]);
    expect(resolved.effective.filesystem.read).toEqual(["project"]);
  });

  it("rejects growing filesystem.write", () => {
    const fs = new MemoryFileSystem();
    writeWorkspacePolicy(fs, policy("workspace", "w", {
      filesystem: { read: [], write: ["project/dist"] },
    }));
    writeProjectPolicy(fs, policy("project", "p", {
      filesystem: { read: [], write: ["project/dist", "project/tmp"] },
    }));
    const error = weakenError(() => resolve(fs));
    expect(error.field).toBe("filesystem.write");
  });

  it("allows decreasing maxBundleKilobytes", () => {
    const fs = new MemoryFileSystem();
    writeWorkspacePolicy(fs, policy("workspace", "w", {
      maxBundleKilobytes: 500,
    }));
    writeProjectPolicy(fs, policy("project", "p", { maxBundleKilobytes: 250 }));
    expect(resolve(fs).effective.maxBundleKilobytes).toBe(250);
  });

  it("rejects increasing maxBundleKilobytes", () => {
    const fs = new MemoryFileSystem();
    writeWorkspacePolicy(fs, policy("workspace", "w", {
      maxBundleKilobytes: 250,
    }));
    writeProjectPolicy(fs, policy("project", "p", { maxBundleKilobytes: 500 }));
    const error = weakenError(() => resolve(fs));
    expect(error.field).toBe("maxBundleKilobytes");
  });

  it("requiredApprovals are add-only", () => {
    const fs = new MemoryFileSystem();
    writeWorkspacePolicy(fs, policy("workspace", "w", {
      requiredApprovals: ["command-execution"],
    }));
    writeProjectPolicy(fs, policy("project", "p", {
      requiredApprovals: ["command-execution", "project-write"],
    }));
    const resolved = resolve(fs);
    expect(resolved.effective.requiredApprovals).toEqual([
      "command-execution",
      "project-write",
    ]);
  });
});

describe("PolicyResolver provenance and determinism", () => {
  it("records an inheritedDeny when a deny strips an allowlist entry", () => {
    const fs = new MemoryFileSystem();
    writeWorkspacePolicy(fs, policy("workspace", "w", {
      allowedConnectors: ["web-platform", "gsap"],
    }));
    const resolved = resolve(fs, {
      runPolicy: policy("run", "run-policy", {
        deniedConnectors: ["gsap"],
      }),
    });
    expect(resolved.effective.allowedConnectors).toEqual(["web-platform"]);
    const decision = resolved.decisions.find(
      (d) => d.field === "allowedConnectors" && d.inheritedDeny
    );
    expect(decision?.inheritedDeny).toBe(true);
    expect(decision?.reasonCode).toBe("POLICY_DENY_INHERITED");
    expect(decision?.layer).toBe("run");
  });

  it("produces identical snapshots for reordered allowlist entries", () => {
    const fsA = new MemoryFileSystem();
    writeProjectPolicy(fsA, policy("project", "p", {
      allowedConnectors: ["web-platform", "motion"],
    }));
    const fsB = new MemoryFileSystem();
    writeProjectPolicy(fsB, policy("project", "p", {
      allowedConnectors: ["motion", "web-platform"],
    }));
    const a = resolve(fsA);
    const b = resolve(fsB);
    expect(a.effective.allowedConnectors).toEqual(b.effective.allowedConnectors);
    expect(a.snapshotId).toBe(b.snapshotId);
  });

  it("reports the builtin as the source for baseline decisions", () => {
    const resolved = resolve(new MemoryFileSystem());
    const decision = resolved.decisions.find((d) => d.field === "allowPaidServices");
    expect(decision?.layer).toBe("builtin");
    expect(decision?.sourcePolicyId).toBeNull();
  });
});
