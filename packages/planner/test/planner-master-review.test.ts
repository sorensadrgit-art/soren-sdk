import { describe, expect, it } from "vitest";

import { DeterministicExecutionPlanner } from "../src/index.js";

const digest = (digit: string) =>
  `sha256:${digit.repeat(64)}` as `sha256:${string}`;

function input() {
  return {
    projectSnapshot: digest("1"),
    catalogSnapshot: digest("2"),
    policySnapshot: digest("3"),
    routePlan: { id: "route_1", digest: digest("4") },
    contextReferences: [],
    objective: "Plan safely",
    constraints: [],
    runnerCapabilities: {
      browser: { version: "1", name: "chromium" },
      node: "24"
    }
  };
}

describe("Phase 8 planner master review regressions", () => {
  it("rejects a plan whose immutable digest was replaced", () => {
    const planner = new DeterministicExecutionPlanner();
    const plan = planner.create(input());
    const result = planner.validate({
      ...plan,
      immutableDigest: digest("f")
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toMatch(/digest/i);
  });

  it("rejects a plan whose id is not derived from its digest", () => {
    const planner = new DeterministicExecutionPlanner();
    const plan = planner.create(input());
    const result = planner.validate({
      ...plan,
      executionPlanId: "plan_wrong"
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toMatch(/id/i);
  });

  it("does not report drift for equivalent object key ordering", () => {
    const planner = new DeterministicExecutionPlanner();
    const plan = planner.create(input());
    const report = planner.compare(plan, {
      ...input(),
      runnerCapabilities: {
        node: "24",
        browser: { name: "chromium", version: "1" }
      }
    });

    expect(report.drifted).toBe(false);
    expect(report.differences).toEqual([]);
  });
});
