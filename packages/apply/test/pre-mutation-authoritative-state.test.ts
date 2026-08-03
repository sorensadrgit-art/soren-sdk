import { describe, expect, it } from "vitest";

import type { SandboxSession } from "@soren-sdk/sandbox";

import {
  DefaultApplyService,
  InMemoryEvidenceSink,
  registerSandboxFactory
} from "../src/index.js";
import {
  fixedClock,
  sampleApproval,
  sampleExecutionPlan,
  sampleProjectSnapshot,
  sampleSandboxPolicy,
  sampleVcsState
} from "./fixtures.js";

const encoder = new TextEncoder();

function makeState() {
  const plan = sampleExecutionPlan({
    fileChanges: [
      {
        operation: "create",
        path: "src/new.ts",
        contentDigest:
          "sha256:1f3e717c9eb7de3c681eff9d4eb701849f70e6f2bb61d944e5035d08ca3d7ec2"
      }
    ]
  });
  return {
    plan,
    approval: sampleApproval(),
    project: sampleProjectSnapshot(),
    policy: {
      policyId: "policy_1",
      digest:
        "sha256:3333333333333333333333333333333333333333333333333333333333333333"
    },
    vcs: sampleVcsState(),
    sandboxPolicy: sampleSandboxPolicy(),
    revoked: false
  };
}

function makeService(state: ReturnType<typeof makeState>) {
  const evidence = new InMemoryEvidenceSink();
  const service = new DefaultApplyService({
    evidenceSink: evidence,
    clock: fixedClock(),
    authoritativeState: {
      approvedPlanProvider: {
        async getApprovedPlan() {
          return state.revoked ? null : { executionPlan: state.plan, approval: state.approval };
        }
      },
      projectSnapshotProvider: {
        async getCurrentProjectSnapshot() {
          return state.project;
        }
      },
      resolvedPolicyProvider: {
        async getCurrentPolicySnapshot() {
          return { ...state.policy, document: {} };
        }
      },
      vcsStateProvider: {
        async getCurrentVcsState() {
          return state.vcs;
        }
      },
      sandboxPolicyProvider: {
        async getCurrentSandboxPolicy() {
          return state.sandboxPolicy;
        }
      }
    }
  });
  service.setEnabledForTesting(true);
  return service;
}

function prepare(service: DefaultApplyService, state: ReturnType<typeof makeState>) {
  return service.prepare({
    executionPlan: state.plan,
    approval: state.approval,
    projectSnapshot: state.project,
    policySnapshot: state.policy,
    sandboxPolicy: state.sandboxPolicy,
    vcsState: state.vcs
  });
}

function installCountingSandbox() {
  let writes = 0;
  registerSandboxFactory({
    async create(sandboxId: string): Promise<SandboxSession> {
      return {
        id: sandboxId,
        root: "/sandbox/authoritative",
        policy: sampleSandboxPolicy(),
        async read() {
          throw new Error("missing");
        },
        async write() {
          writes += 1;
        },
        async remove() {},
        async list() {
          return [];
        },
        async snapshot() {
          return {
            root: "/sandbox/authoritative",
            entries: [],
            digest:
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          };
        },
        async close() {}
      };
    }
  });
  return () => writes;
}

async function expectLateDriftBlocked(
  mutate: (state: ReturnType<typeof makeState>) => void,
  code: string
) {
  const state = makeState();
  const service = makeService(state);
  const preparation = prepare(service, state);
  expect(preparation.ready).toBe(true);

  mutate(state);
  const writes = installCountingSandbox();
  await expect(
    service.apply({
      preparation,
      sandboxId: "late-drift",
      contentProvider: async () => encoder.encode("export const x = 1;")
    })
  ).rejects.toMatchObject({ code });
  expect(writes()).toBe(0);
}

describe("pre-mutation authoritative state rechecks", () => {
  it("proves preparation-time validation alone is insufficient", async () => {
    await expectLateDriftBlocked(
      (state) => {
        state.project = {
          ...state.project,
          snapshotId:
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        };
      },
      "APPLY_DRIFT_PROJECT"
    );
  });

  it("blocks late policy, protected-branch, dirty-workspace, and sandbox-policy drift", async () => {
    await expectLateDriftBlocked(
      (state) => {
        state.policy = {
          ...state.policy,
          digest:
            "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        };
      },
      "APPLY_DRIFT_POLICY"
    );
    await expectLateDriftBlocked(
      (state) => {
        state.vcs = { ...state.vcs, protectedBranch: true, branch: "main" };
      },
      "APPLY_DRIFT_PROJECT"
    );
    await expectLateDriftBlocked(
      (state) => {
        state.vcs = { ...state.vcs, dirty: true };
      },
      "APPLY_DRIFT_PROJECT"
    );
    await expectLateDriftBlocked(
      (state) => {
        state.sandboxPolicy = { ...state.sandboxPolicy, maxBytes: 1 };
      },
      "APPLY_DRIFT_POLICY"
    );
  });

  it("blocks a late expired, consumed, or revoked approval before mutation", async () => {
    await expectLateDriftBlocked(
      (state) => {
        state.approval = sampleApproval({ expiresAt: "2025-01-01T00:00:00.000Z" });
      },
      "APPLY_APPROVAL_EXPIRED"
    );
    await expectLateDriftBlocked(
      (state) => {
        state.revoked = true;
      },
      "APPLY_APPROVAL_REVOKED"
    );
    await expectLateDriftBlocked(
      (state) => {
        state.revoked = true;
      },
      "APPLY_APPROVAL_REVOKED"
    );
  });
});
