import { describe, expect, it } from "vitest";

import type { SandboxSession } from "@soren-sdk/sandbox";
import { MemorySandboxSession } from "@soren-sdk/sandbox";

import {
  DefaultApplyService,
  InMemoryEvidenceSink,
  registerSandboxFactory
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

function persistentSession(seed: Record<string, Uint8Array>): {
  session: SandboxSession;
  raw: MemorySandboxSession;
} {
  const raw = new MemorySandboxSession(
    "rollback-restoration",
    "/sandbox/rollback-restoration",
    sampleSandboxPolicy(),
    seed,
    fixedClock()
  );
  const session: SandboxSession = {
    id: raw.id,
    root: raw.root,
    policy: raw.policy,
    read: (path) => raw.read(path),
    write: (path, content) => raw.write(path, content),
    remove: (path) => raw.remove(path),
    list: (path) => raw.list(path),
    snapshot: () => raw.snapshot(),
    async close() {
      // Keep the deterministic test sandbox readable after apply completes.
    }
  };
  return { session, raw };
}

function preparation(service: DefaultApplyService) {
  const plan = sampleExecutionPlan({
    fileChanges: [
      {
        operation: "update",
        path: "src/index.ts",
        contentDigest: digestContent("after index")
      },
      { operation: "delete", path: "src/old.ts", contentDigest: null },
      {
        operation: "create",
        path: "src/new.ts",
        contentDigest: digestContent("new file")
      },
      {
        operation: "create",
        path: "src/fail.ts",
        contentDigest: digestContent("expected content")
      }
    ]
  });
  const approval = sampleApproval({
    nonce: "nonce-rollback-restore-0001",
    allowedPaths: ["src"],
    allowedOperations: ["create-file", "replace-file", "delete-file"]
  });
  return service.prepare({
    executionPlan: plan,
    approval,
    projectSnapshot: sampleProjectSnapshot(),
    policySnapshot: {
      policyId: "policy_1",
      digest:
        "sha256:3333333333333333333333333333333333333333333333333333333333333333"
    },
    sandboxPolicy: sampleSandboxPolicy(),
    vcsState: sampleVcsState()
  });
}

describe("rollback restoration", () => {
  it("restores replaced and deleted files and removes created files", async () => {
    const evidence = new InMemoryEvidenceSink();
    const service = new DefaultApplyService({
      evidenceSink: evidence,
      clock: fixedClock()
    });
    service.setEnabledForTesting(true);

    const { session, raw } = persistentSession({
      "src/index.ts": encoder.encode("before index"),
      "src/old.ts": encoder.encode("before old")
    });
    registerSandboxFactory({
      async create() {
        return session;
      }
    });

    const prepared = preparation(service);
    expect(prepared.ready).toBe(true);

    const result = await service.apply({
      preparation: prepared,
      sandboxId: "rollback-restoration",
      async contentProvider(path) {
        if (path === "src/index.ts") return encoder.encode("after index");
        if (path === "src/new.ts") return encoder.encode("new file");
        if (path === "src/fail.ts") return encoder.encode("wrong content");
        throw new Error(`Unexpected content request for ${path}`);
      }
    });

    expect(result.status).toBe("rolled-back");
    expect(new TextDecoder().decode(await raw.read("src/index.ts"))).toBe(
      "before index"
    );
    expect(new TextDecoder().decode(await raw.read("src/old.ts"))).toBe(
      "before old"
    );
    await expect(raw.read("src/new.ts")).rejects.toThrow();
    expect(result.afterSnapshotDigest).toBe(result.beforeSnapshotDigest);
    expect(result.rollback.every((entry) => entry.verified)).toBe(true);
  });
});
