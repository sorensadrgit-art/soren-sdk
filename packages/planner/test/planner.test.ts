import { describe, expect, it } from "vitest";

import { DeterministicExecutionPlanner, type PlanningInputs } from "../src/index.js";
import type { JsonValue } from "@soren-sdk/contracts";

const digest = (digit: string) => `sha256:${digit.repeat(64)}` as `sha256:${string}`;

function input(overrides: Partial<PlanningInputs> = {}): PlanningInputs {
  return {
    projectSnapshot: digest("1"),
    catalogSnapshot: digest("2"),
    policySnapshot: digest("3"),
    routePlan: { id: "route_1", digest: digest("4") },
    contextReferences: [
      { id: "b", digest: digest("5") },
      { id: "a", digest: digest("6") }
    ],
    objective: "Plan safely",
    constraints: ["b", "a"],
    ...overrides
  };
}

function compareWithCapabilities(value: unknown): void {
  const planner = new DeterministicExecutionPlanner();
  const plan = planner.create(input());
  const current = input({ runnerCapabilities: { worker: "ready" } });
  const capabilities = current.runnerCapabilities;
  if (capabilities === undefined) throw new Error("Expected runner capabilities.");
  Reflect.set(capabilities, "worker", value);
  planner.compare(plan, current);
}

describe("DeterministicExecutionPlanner", () => {
  it("does not report drift when optional fields are absent", () => {
    const planner = new DeterministicExecutionPlanner();
    const plan = planner.create(input());

    expect(() => planner.compare(plan, input())).not.toThrow();
    expect(planner.compare(plan, input())).toEqual({ drifted: false, differences: [] });
  });

  it("reports lockfile drift when it is present only in one side", () => {
    const planner = new DeterministicExecutionPlanner();
    const lockfile = { id: "pnpm-lock", digest: digest("7") };

    expect(planner.compare(planner.create(input({ lockfile })), input()).differences).toContain("lockfile");
    expect(planner.compare(planner.create(input()), input({ lockfile })).differences).toContain("lockfile");
  });

  it("does not report drift for equivalent lockfiles", () => {
    const planner = new DeterministicExecutionPlanner();
    const lockfile = { id: "pnpm-lock", digest: digest("7") };
    const plan = planner.create(input({ lockfile }));

    expect(planner.compare(plan, input({ lockfile }))).toEqual({ drifted: false, differences: [] });
  });

  it("reports runner capability drift when it is present only in one side", () => {
    const planner = new DeterministicExecutionPlanner();
    const capabilities = { node: "24" };

    expect(
      planner.compare(planner.create(input({ runnerCapabilities: capabilities })), input()).differences
    ).toContain("runnerCapabilities");
    expect(
      planner.compare(planner.create(input()), input({ runnerCapabilities: capabilities })).differences
    ).toContain("runnerCapabilities");
  });

  it("does not report drift for equivalent nested runner capability object ordering", () => {
    const planner = new DeterministicExecutionPlanner();
    const plan = planner.create(
      input({
        runnerCapabilities: {
          runtime: { node: 24, platform: "win32" },
          browser: { version: "1", name: "chromium" }
        }
      })
    );

    expect(
      planner.compare(
        plan,
        input({
          runnerCapabilities: {
            browser: { name: "chromium", version: "1" },
            runtime: { platform: "win32", node: 24 }
          }
        })
      )
    ).toEqual({ drifted: false, differences: [] });
  });

  it("normalizes context-reference and constraint ordering while detecting semantic changes", () => {
    const planner = new DeterministicExecutionPlanner();
    const plan = planner.create(input());

    expect(
      planner.compare(
        plan,
        input({
          contextReferences: [...input().contextReferences].reverse(),
          constraints: ["a", "b"]
        })
      )
    ).toEqual({ drifted: false, differences: [] });
    expect(
      planner.compare(plan, input({ contextReferences: [{ id: "a", digest: digest("f") }, { id: "b", digest: digest("5") }] })).differences
    ).toContain("contextReferences");
    expect(planner.compare(plan, input({ constraints: ["a", "c"] })).differences).toContain(
      "constraints"
    );
  });

  it("keeps absent and null runner capabilities semantically distinct", () => {
    const planner = new DeterministicExecutionPlanner();
    const plan = planner.create(input());
    const current = input();
    Reflect.set(current as object, "runnerCapabilities", null);

    expect(planner.compare(plan, current).differences).toContain("runnerCapabilities");
  });

  it("rejects nested undefined capability values with their semantic path", () => {
    const planner = new DeterministicExecutionPlanner();
    const plan = planner.create(input());
    const current = input({ runnerCapabilities: { worker: { timeout: 30 } } });
    const worker = current.runnerCapabilities?.worker;
    if (worker === undefined || worker === null || typeof worker !== "object") {
      throw new Error("Expected a mutable worker capability object.");
    }
    Reflect.set(worker, "timeout", undefined);

    expect(() => planner.compare(plan, current)).toThrow(
      "Value at current.runnerCapabilities.worker.timeout is not valid JSON."
    );
  });

  it.each([
    ["bigint", 1n],
    ["function", () => undefined],
    ["symbol", Symbol("worker")],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["Date", new Date(0)],
    ["Map", new Map([["worker", "ready"]])]
  ])("rejects invalid %s runner capability values", (_name, value) => {
    expect(() => compareWithCapabilities(value)).toThrow(
      "Value at current.runnerCapabilities.worker is not valid JSON."
    );
  });

  it("rejects cyclic runner capability values", () => {
    const cyclic: Record<string, JsonValue> = {};
    cyclic.self = cyclic;

    expect(() => compareWithCapabilities(cyclic)).toThrow(
      "Value at current.runnerCapabilities.worker.self is not valid JSON."
    );
  });

  it.each(["__proto__", "prototype", "constructor"])(
    "rejects dangerous runner capability key %s",
    (key) => {
      const capabilities: Record<string, JsonValue> = {};
      Object.defineProperty(capabilities, key, { enumerable: true, value: "forbidden" });
      const planner = new DeterministicExecutionPlanner();
      const plan = planner.create(input());

      expect(() => planner.compare(plan, input({ runnerCapabilities: capabilities }))).toThrow(
        `Value at current.runnerCapabilities.${key} is not valid JSON.`
      );
    }
  );

  it("blocks policy-denied steps and uses repository-standard secret wording", () => {
    const planner = new DeterministicExecutionPlanner();
    expect(planner.create({ ...input(), deniedSteps: ["network"] }).status).toBe("blocked");
    expect(() => planner.create({ ...input(), objective: "token=secret" })).toThrow(
      "Secret-like data is forbidden at input.objective."
    );
    expect(() =>
      planner.create({ ...input(), runnerCapabilities: { apiKey: "present" } })
    ).toThrow("Secret-like field is forbidden at input.runnerCapabilities.apiKey.");
  });
});
