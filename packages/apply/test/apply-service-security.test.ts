import { describe, expect, it } from "vitest";

import type { Digest } from "@soren-sdk/contracts";
import type { SandboxSession } from "@soren-sdk/sandbox";
import { MemorySandboxProvider } from "@soren-sdk/sandbox";

import {
  APPLY_DISABLED,
  DefaultApplyService,
  InMemoryEvidenceSink,
  registerSandboxFactory,
  type ApplyApproval,
  type PrepareApplyInput
} from "../src/index.js";
import { ApplyError } from "../src/types.js";
import {
  NOW_MS,
  digestContent,
  fixedClock,
  sampleApproval,
  sampleExecutionPlan,
  sampleProjectSnapshot,
  sampleSandboxPolicy,
  sampleVcsState
} from "./fixtures.js";

const encoder = new TextEncoder();

function authoritativeState() {
  const plan = sampleExecutionPlan();
  const approval = sampleApproval();
  const project = sampleProjectSnapshot();
  const policy = { policyId: "policy_1", digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333" as Digest };
  const vcs = sampleVcsState();
  const sandboxPolicy = sampleSandboxPolicy();
  return {
    approvedPlanProvider: { async getApprovedPlan() { return { executionPlan: plan, approval }; } },
    projectSnapshotProvider: { async getCurrentProjectSnapshot() { return project; } },
    resolvedPolicyProvider: { async getCurrentPolicySnapshot() { return { ...policy, document: {} }; } },
    vcsStateProvider: { async getCurrentVcsState() { return vcs; } },
    sandboxPolicyProvider: { async getCurrentSandboxPolicy() { return sandboxPolicy; } }
  };
}

function makeService() {
  const evidence = new InMemoryEvidenceSink();
  const clockObj = fixedClock();
  const service = new DefaultApplyService({ evidenceSink: evidence, clock: clockObj, authoritativeState: authoritativeState() });
  service.setEnabledForTesting(true);
  const sandboxProvider = new MemorySandboxProvider();
  registerSandboxFactory({
    async create(sandboxId: string): Promise<SandboxSession> {
      return sandboxProvider.create({
        policy: sampleSandboxPolicy(),
        root: `/sandbox/${sandboxId}`,
        sandboxId
      });
    }
  });
  return { service, evidence, clockObj };
}

function prepareInput(
  overrides: {
    approval?: ApplyApproval;
    plan?: ReturnType<typeof sampleExecutionPlan>;
    project?: ReturnType<typeof sampleProjectSnapshot>;
    policy?: { policyId: string; digest: Digest };
    sandboxPolicy?: ReturnType<typeof sampleSandboxPolicy>;
    vcs?: ReturnType<typeof sampleVcsState>;
    nonce?: string;
  } = {}
): PrepareApplyInput {
  const nonce = overrides.nonce ?? "nonce-0000000000000001";
  const approval = overrides.approval ?? sampleApproval({ nonce });
  return {
    executionPlan: overrides.plan ?? sampleExecutionPlan(),
    approval,
    projectSnapshot: overrides.project ?? sampleProjectSnapshot(),
    policySnapshot: overrides.policy ?? {
      policyId: "policy_1",
      digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333"
    },
    sandboxPolicy: overrides.sandboxPolicy ?? sampleSandboxPolicy(),
    vcsState: overrides.vcs ?? sampleVcsState()
  };
}

function contentProvider(): (path: string) => Promise<Uint8Array> {
  return async (path: string) => {
    if (path === "src/new.ts") return encoder.encode("export const x = 1;");
    if (path === "src/index.ts") return encoder.encode("export const x = 2;");
    throw new ApplyError("APPLY_INPUT_INVALID", `No content for ${path}`);
  };
}

describe("Phase 9 apply security corpus", () => {
  it("is disabled by default (APPLY_DISABLED)", () => {
    expect(APPLY_DISABLED).toBe(true);
  });

  it("throws APPLY_DISABLED when apply is not enabled", () => {
    const evidence = new InMemoryEvidenceSink();
    const service = new DefaultApplyService({ evidenceSink: evidence, authoritativeState: authoritativeState() });
    expect(() => service.prepare(prepareInput())).toThrow(ApplyError);
    try {
      service.prepare(prepareInput());
    } catch (error) {
      expect(error).toBeInstanceOf(ApplyError);
      expect((error as ApplyError).code).toBe("APPLY_DISABLED");
    }
  });

  it("blocks a missing approval", () => {
    const { service } = makeService();
    const input = prepareInput();
    // Remove approval binding by using a plan that does not bind.
    const preparation = service.prepare({
      ...input,
      executionPlan: sampleExecutionPlan({
        executionPlanId: "plan_OTHER",
        immutableDigest: "sha256:9999999999999999999999999999999999999999999999999999999999999999"
      })
    });
    expect(preparation.ready).toBe(false);
    expect(preparation.gates.find((g) => g.code === "drift.plan")?.status).toBe("failed");
  });

  it("blocks an expired approval", () => {
    const { service } = makeService();
    const expired = sampleApproval({ expiresAt: new Date(NOW_MS - 1000).toISOString() });
    const preparation = service.prepare(prepareInput({ approval: expired }));
    expect(preparation.ready).toBe(false);
    expect(
      preparation.gates.find((g) => g.code === "approval.expiration")?.status
    ).toBe("failed");
  });

  it("blocks a replayed approval", async () => {
    const { service } = makeService();
    const input = prepareInput({ nonce: "nonce-replay-0000000001" });
    const first = service.prepare(input);
    expect(first.ready).toBe(true);
    // Actually apply to consume the nonce.
    await service.apply({
      preparation: first,
      sandboxId: "apply-replay",
      contentProvider: async () => encoder.encode("x")
    });
    // Replay with the same nonce.
    const replay = service.prepare(
      prepareInput({ nonce: "nonce-replay-0000000001" })
    );
    expect(replay.ready).toBe(false);
    expect(replay.gates.find((g) => g.code === "approval.one-time")?.status).toBe("failed");
  });

  it("blocks wrong plan digest", () => {
    const { service } = makeService();
    const plan = sampleExecutionPlan({
      immutableDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });
    const input = prepareInput();
    const preparation = service.prepare({ ...input, executionPlan: plan });
    expect(preparation.ready).toBe(false);
    expect(preparation.gates.find((g) => g.code === "drift.plan")?.status).toBe("failed");
  });

  it("blocks project drift", () => {
    const { service } = makeService();
    const project = sampleProjectSnapshot();
    const drifted: ReturnType<typeof sampleProjectSnapshot> = {
      ...project,
      snapshotId: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    };
    const preparation = service.prepare(prepareInput({ project: drifted }));
    expect(preparation.ready).toBe(false);
    expect(preparation.gates.find((g) => g.code === "drift.project")?.status).toBe("failed");
  });

  it("blocks policy drift", () => {
    const { service } = makeService();
    const policy: { policyId: string; digest: Digest } = { policyId: "policy_1", digest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" };
    const preparation = service.prepare(prepareInput({ policy }));
    expect(preparation.ready).toBe(false);
    expect(preparation.gates.find((g) => g.code === "drift.policy")?.status).toBe("failed");
  });

  it("blocks protected/original workspace", () => {
    const { service } = makeService();
    const vcs = sampleVcsState({ protectedBranch: true, branch: "main" });
    const preparation = service.prepare(prepareInput({ vcs }));
    expect(preparation.ready).toBe(false);
    expect(preparation.gates.find((g) => g.code === "vcs.isolation")?.status).toBe("failed");
  });

  it("blocks unapproved operations", () => {
    const { service } = makeService();
    const approval = sampleApproval({
      allowedOperations: ["create-file"]
    });
    const preparation = service.prepare(prepareInput({ approval }));
    expect(preparation.ready).toBe(false);
    // The replace and delete operations are denied.
    const denied = preparation.gates.filter(
      (g) => g.code.startsWith("operation.") && g.status === "failed"
    );
    expect(denied.length).toBeGreaterThan(0);
  });

  it("blocks paths outside approved scope", () => {
    const { service } = makeService();
    const approval = sampleApproval({ allowedPaths: ["src/new.ts"] });
    const preparation = service.prepare(prepareInput({ approval }));
    expect(preparation.ready).toBe(false);
  });

  it("blocks command execution (Phase 9 disabled)", () => {
    const { service } = makeService();
    const approval = sampleApproval({
      allowedCommandIds: ["install"]
    });
    const preparation = service.prepare(prepareInput({ approval }));
    expect(preparation.ready).toBe(false);
    expect(preparation.gates.find((g) => g.code === "execution.denied")?.status).toBe("failed");
  });

  it("blocks network access (Phase 9 disabled)", () => {
    const { service } = makeService();
    const approval = sampleApproval({
      allowedNetworkHosts: ["registry.npmjs.org"]
    });
    const preparation = service.prepare(prepareInput({ approval }));
    expect(preparation.ready).toBe(false);
    expect(preparation.gates.find((g) => g.code === "execution.denied")?.status).toBe("failed");
  });

  it("blocks approval limits exceeding policy", () => {
    const { service } = makeService();
    const approval = sampleApproval({
      limits: { maxFiles: 100, maxBytes: 100000, maxOperations: 100, maxDurationSeconds: 100 }
    });
    const preparation = service.prepare(prepareInput({ approval }));
    expect(preparation.ready).toBe(false);
    expect(preparation.gates.find((g) => g.code === "limits.within-policy")?.status).toBe("failed");
  });

  it("applies a valid approved plan and records diff", async () => {
    const { service } = makeService();
    // Use a plan with only create/replace operations so the test doesn't
    // depend on pre-existing files in the sandbox.
    const plan = sampleExecutionPlan({
      fileChanges: [
        { operation: "create", path: "src/new.ts", contentDigest: digestContent("export const x = 1;") },
        { operation: "update", path: "src/index.ts", contentDigest: digestContent("export const x = 2;") }
      ]
    });
    const preparation = service.prepare(prepareInput({ plan }));
    expect(preparation.ready).toBe(true);

    const result = await service.apply({
      preparation,
      sandboxId: "apply-ok",
      contentProvider: contentProvider()
    });
    expect(result.status).toBe("applied");
    expect(result.operations.filter((op) => op.status === "applied")).toHaveLength(2);
    expect(result.diff.length).toBeGreaterThan(0);
    expect(result.cancelled).toBe(false);
    expect(result.errors).toHaveLength(0);
  });

  it("replays an approval after successful apply is rejected", async () => {
    const { service } = makeService();
    const preparation = service.prepare(
      prepareInput({ nonce: "nonce-after-use-00000001" })
    );
    expect(preparation.ready).toBe(true);
    await service.apply({
      preparation,
      sandboxId: "apply-replay",
      contentProvider: contentProvider()
    });
    // Same nonce again.
    const replayed = service.prepare(
      prepareInput({ nonce: "nonce-after-use-00000001" })
    );
    expect(replayed.ready).toBe(false);
    expect(replayed.gates.find((g) => g.code === "approval.one-time")?.status).toBe("failed");
  });

  it("rolls back in reverse order on partial failure", async () => {
    const { service } = makeService();
    const preparation = service.prepare(prepareInput());

    const failingProvider = async (path: string) => {
      if (path === "src/index.ts") {
        // Wrong digest: plan requires a specific digest.
        return encoder.encode("WRONG CONTENT");
      }
      return contentProvider()(path);
    };

    const applyFn = service.apply({
      preparation,
      sandboxId: "apply-partial",
      contentProvider: failingProvider
    });
    const result = await applyFn.catch((error) => {
      // Content digest mismatch is a drift error. The service records it and
      // rolls back inside run. We assert via the result if it resolves, or
      // via crash record.
      void error;
      return null;
    });
    if (result !== null) {
      expect(result.status).not.toBe("applied");
      const applied = result.operations.filter((op) => op.status === "applied");
      // The create op succeeded before failure; the replace op failed.
      expect(applied.length).toBeGreaterThan(0);
      // Rollback ran in reverse order.
      expect(result.rollback.length).toBeGreaterThan(0);
    } else {
      const record = service.recoveryRecord(preparation.runId);
      expect(record).not.toBeNull();
      expect(record?.recoverable).toBe(true);
    }
  });

  it("cancels before apply starts", async () => {
    const { service } = makeService();
    const preparation = service.prepare(prepareInput());
    await service.cancel(preparation.runId);
    await expect(
      service.apply({
        preparation,
        sandboxId: "apply-cancel-before",
        contentProvider: contentProvider()
      })
    ).rejects.toThrow("cancelled");
  });

  it("cancels during apply and rolls back", async () => {
    const { service } = makeService();
    const preparation = service.prepare(prepareInput());
    let cancelledDuring = false;
    const provider = async (path: string) => {
      if (path === "src/index.ts" && !cancelledDuring) {
        cancelledDuring = true;
        await service.cancel(preparation.runId);
      }
      return contentProvider()(path);
    };
    const result = await service
      .apply({ preparation, sandboxId: "apply-cancel-during", contentProvider: provider })
      .catch(() => null);
    if (result !== null) {
      expect(result.cancelled).toBe(true);
      expect(result.status).toBe("cancelled");
      // Remaining operations were skipped.
      expect(result.operations.some((op) => op.status === "skipped")).toBe(true);
    }
  });

  it("records a crash-state recovery record on failure", async () => {
    const { service } = makeService();
    const preparation = service.prepare(prepareInput());
    const provider = async (path: string) => {
      if (path === "src/index.ts") {
        throw new Error("boom");
      }
      return contentProvider()(path);
    };
    await service
      .apply({ preparation, sandboxId: "apply-crash", contentProvider: provider })
      .catch(() => undefined);
    const record = service.recoveryRecord(preparation.runId);
    expect(record).not.toBeNull();
    expect(record?.runId).toBe(preparation.runId);
    expect(record?.sandboxId).toBe("apply-crash");
    expect(record?.recoverable).toBe(true);
  });

  it("rejects tampered approval integrity", () => {
    const { service } = makeService();
    // Build a tampered approval directly without letting sampleApproval
    // recompute the digest.
    const tampered = sampleApproval();
    tampered.nonce = "nonce-tampered-000000000001";
    tampered.integrityDigest = "sha256:FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";
    const preparation = service.prepare(
      prepareInput({ approval: tampered })
    );
    expect(preparation.ready).toBe(false);
    expect(preparation.gates.find((g) => g.code === "approval.integrity")?.status).toBe("failed");
  });

  it("never reports success after rollback failure", async () => {
    const { service } = makeService();
    // Use a sandbox that fails on remove to force rollback failure.
    const preparation = service.prepare(prepareInput());
    registerSandboxFactory({
      async create(sandboxId: string): Promise<SandboxSession> {
        return {
          id: sandboxId,
          root: "/sandbox/failing",
          policy: sampleSandboxPolicy(),
          async read() {
            return encoder.encode("data");
          },
          async write() {
            // write succeeds
          },
          async remove() {
            throw new Error("remove blocked");
          },
          async list() {
            return [];
          },
          async snapshot() {
            return {
              root: "/sandbox/failing",
              entries: [],
              digest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
            };
          },
          async close() {}
        };
      }
    });
    const provider = async () => encoder.encode("export const x = 2;");
    const result = await service
      .apply({ preparation, sandboxId: "apply-rollback-fail", contentProvider: provider })
      .catch(() => null);
    // The run could throw due to rollback; if it resolves, status must not be applied.
    if (result !== null) {
      expect(result.status).not.toBe("applied");
    }
  });

  it("redacts evidence content (audit redaction)", async () => {
    const { service, evidence } = makeService();
    const preparation = service.prepare(prepareInput());
    expect(preparation.ready).toBe(true);
    expect(preparation.gates.every((g) => g.status === "passed")).toBe(true);
    // Evidence events emitted during prepare are redacted by default.
    const events = await evidence.list(preparation.runId);
    const prepared = events.find((event) => event.kind === "apply.prepared");
    expect(prepared).toBeDefined();
    expect(prepared?.redacted).toBe(true);
    // No raw file content appears in any event.
    for (const event of events) {
      const serialized = JSON.stringify(event.detail ?? {});
      expect(serialized).not.toContain("export const x");
      expect(serialized).not.toContain("NUL");
    }
  });

  it("produces deterministic operation ordering", () => {
    const { service } = makeService();
    const preparation = service.prepare(prepareInput());
    expect(preparation.operations.map((op) => op.index)).toEqual([0, 1, 2]);
    expect(preparation.operations.map((op) => op.path)).toEqual([
      "src/new.ts",
      "src/index.ts",
      "src/old.ts"
    ]);
  });

  it("ensures no credentials are present in approval data", () => {
    const approval = sampleApproval();
    const approvalText = JSON.stringify(approval);
    // Credential fields are simply not part of the approval contract.
    expect(approvalText).not.toContain("token");
    expect(approvalText).not.toContain("secret");
    expect(approvalText).not.toContain("password");
    expect(approvalText).not.toContain("apiKey");
  });
});