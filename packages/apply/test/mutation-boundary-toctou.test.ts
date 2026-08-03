import { describe, expect, it } from "vitest";

import type { SandboxSession } from "@soren-sdk/sandbox";
import { MemorySandboxSession } from "@soren-sdk/sandbox";

import {
  createApplyServiceForTesting,
  InMemoryEvidenceSink,
  type DefaultApplyService
} from "../src/index.js";
import {
  digestContent,
  encoder,
  fixedClock,
  sampleApproval,
  sampleExecutionPlan,
  sampleProjectSnapshot,
  sampleSandboxPolicy,
  sampleVcsState
} from "./fixtures.js";

const POLICY_SNAPSHOT = {
  policyId: "policy_1",
  digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333" as const
};

function makeState(plan = sampleExecutionPlan()) {
  return {
    plan,
    approval: sampleApproval(),
    project: sampleProjectSnapshot(),
    policy: POLICY_SNAPSHOT,
    vcs: sampleVcsState(),
    sandboxPolicy: sampleSandboxPolicy()
  };
}

function makeService(
  state: ReturnType<typeof makeState>,
  session: SandboxSession
): DefaultApplyService {
  return createApplyServiceForTesting({
    evidenceSink: new InMemoryEvidenceSink(),
    clock: fixedClock(),
    sandboxProvider: {
      async create() {
        return session;
      }
    },
    authoritativeState: {
      approvedPlanProvider: {
        async getApprovedPlan() {
          return { executionPlan: state.plan, approval: state.approval };
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

function driftProject(state: ReturnType<typeof makeState>): void {
  state.project = {
    ...state.project,
    snapshotId:
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  };
}

function createSession(seed: Record<string, Uint8Array> = {}) {
  const raw = new MemorySandboxSession(
    "mutation-boundary-toctou",
    "/sandbox/mutation-boundary-toctou",
    sampleSandboxPolicy(),
    seed,
    fixedClock()
  );
  let writes = 0;
  let removes = 0;
  let onRead: (() => void) | undefined;
  const session: SandboxSession = {
    id: raw.id,
    root: raw.root,
    policy: raw.policy,
    async read(path) {
      const content = await raw.read(path);
      onRead?.();
      return content;
    },
    async write(path, content) {
      writes += 1;
      await raw.write(path, content);
    },
    async remove(path) {
      removes += 1;
      await raw.remove(path);
    },
    list: (path) => raw.list(path),
    snapshot: () => raw.snapshot(),
    async close() {}
  };
  return {
    raw,
    session,
    setOnRead(callback: () => void) {
      onRead = callback;
    },
    writeCount() {
      return writes;
    },
    removeCount() {
      return removes;
    }
  };
}

describe("authoritative state at the mutation boundary", () => {
  it("blocks drift introduced while resolving create-file content", async () => {
    const content = encoder.encode("new content");
    const state = makeState(
      sampleExecutionPlan({
        fileChanges: [
          {
            operation: "create",
            path: "src/new.ts",
            contentDigest: digestContent("new content")
          }
        ]
      })
    );
    const sandbox = createSession();
    const service = makeService(state, sandbox.session);
    const prepared = prepare(service, state);

    const result = await service.apply({
      preparation: prepared,
      sandboxId: sandbox.session.id,
      async contentProvider() {
        driftProject(state);
        return content;
      }
    });

    expect(result.status).toBe("rolled-back");
    expect(result.errors).toContain("Project snapshot or revision changed.");
    expect(sandbox.writeCount()).toBe(0);
    await expect(sandbox.raw.read("src/new.ts")).rejects.toThrow();
  });

  it("rejects a same-id approval replacement before mutation", async () => {
    const state = makeState(
      sampleExecutionPlan({
        fileChanges: [
          {
            operation: "create",
            path: "src/new.ts",
            contentDigest: digestContent("new content")
          }
        ]
      })
    );
    const sandbox = createSession();
    const service = makeService(state, sandbox.session);
    const prepared = prepare(service, state);
    state.approval = sampleApproval({
      approvalId: prepared.approvalId,
      nonce: "nonce-replaced-approval-0001"
    });

    await expect(
      service.apply({
        preparation: prepared,
        sandboxId: sandbox.session.id,
        async contentProvider() {
          return encoder.encode("new content");
        }
      })
    ).rejects.toMatchObject({ code: "APPLY_APPROVAL_REVOKED" });
    expect(sandbox.writeCount()).toBe(0);
  });

  it("blocks drift introduced while capturing a delete preimage", async () => {
    const state = makeState(
      sampleExecutionPlan({
        fileChanges: [
          { operation: "delete", path: "src/old.ts", contentDigest: null }
        ]
      })
    );
    const original = encoder.encode("original content");
    const sandbox = createSession({ "src/old.ts": original });
    sandbox.setOnRead(() => driftProject(state));
    const service = makeService(state, sandbox.session);
    const prepared = prepare(service, state);

    const result = await service.apply({
      preparation: prepared,
      sandboxId: sandbox.session.id,
      async contentProvider() {
        throw new Error("delete must not request content");
      }
    });

    expect(result.status).toBe("rolled-back");
    expect(result.errors).toContain("Project snapshot or revision changed.");
    expect(sandbox.removeCount()).toBe(0);
    expect(new TextDecoder().decode(await sandbox.raw.read("src/old.ts"))).toBe(
      "original content"
    );
  });
});
