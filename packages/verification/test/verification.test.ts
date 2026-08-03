import { describe, expect, it } from "vitest";
import { DeterministicExecutionPlanner } from "@soren-sdk/planner";
import { DeterministicVerificationPlanner } from "../src/index.js";
const digest = `sha256:${"a".repeat(64)}` as `sha256:${string}`;
const plan = new DeterministicExecutionPlanner().create({ projectSnapshot: digest, catalogSnapshot: digest, policySnapshot: digest, routePlan: { id: "route", digest }, contextReferences: [], objective: "test", constraints: [] });
describe("DeterministicVerificationPlanner", () => { it("sorts checks and distinguishes required from optional", () => { const result = new DeterministicVerificationPlanner().create({ executionPlan: plan, requirements: [{ id: "optional", kind: "visual", required: false, reason: "not requested" }, { id: "unit", kind: "unit", required: true }] }); expect(result.checks.map((check) => check.status)).toEqual(["not-required", "not-run"]); expect(() => new DeterministicVerificationPlanner().create({ executionPlan: plan, requirements: [{ id: "x", kind: "unit", required: true }, { id: "x", kind: "unit", required: true }] })).toThrow("Duplicate"); }); });
