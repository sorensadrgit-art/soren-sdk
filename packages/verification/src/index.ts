import { digestJson, type JsonValue, type VerificationPlan, type VerificationState } from "@soren-sdk/contracts";
import type { ExecutionPlan } from "@soren-sdk/planner";

export interface VerificationRequirement { id: string; kind: "contract" | "typecheck" | "unit" | "integration" | "build" | "repository" | "cli-smoke" | "accessibility" | "reduced-motion" | "browser" | "bundle" | "performance" | "security" | "visual" | "connector"; required: boolean; reason?: string; artifacts?: string[]; }
export interface CreateVerificationPlanInput { executionPlan: ExecutionPlan; requirements: VerificationRequirement[]; }
export interface VerificationPlanner { create(input: CreateVerificationPlanInput): VerificationPlan; }
function json(value: unknown): JsonValue { return value as JsonValue; }
export class DeterministicVerificationPlanner implements VerificationPlanner {
  create(input: CreateVerificationPlanInput): VerificationPlan {
    const seen = new Set<string>();
    const checks = [...input.requirements].sort((a, b) => a.id.localeCompare(b.id)).map((requirement) => { if (seen.has(requirement.id)) throw new Error(`Duplicate check ID: ${requirement.id}`); seen.add(requirement.id); const status: VerificationState = requirement.required ? "not-run" : "not-required"; return { id: requirement.id, kind: requirement.kind, required: requirement.required, status, ...(requirement.reason === undefined ? {} : { reason: requirement.reason }), ...(requirement.artifacts === undefined ? {} : { artifacts: [...requirement.artifacts].sort() }) }; });
    const preimage = { executionPlanId: input.executionPlan.executionPlanId, executionPlanDigest: input.executionPlan.immutableDigest, checks };
    const digest = digestJson(json(preimage));
    return { schemaVersion: "1.0.0-draft.1", contractKind: "verification-plan", verificationPlanId: `verify_${digest.slice(7, 31)}`, executionPlanId: input.executionPlan.executionPlanId, executionPlanDigest: input.executionPlan.immutableDigest, checks, digest };
  }
}
