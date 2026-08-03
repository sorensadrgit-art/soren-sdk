import { digestJson, type JsonValue } from "@soren-sdk/contracts";

import type {
  ApplyInput,
  ApplyOutput,
  ApplyProvider,
  ContextSelectionProvider,
  CreatePlanInput,
  CreatePlanOutput,
  GetEvidenceInput,
  GetEvidenceOutput,
  PlanEvidenceProvider,
  ResolvePolicyInput,
  ResolvePolicyOutput,
  ResolvedPolicyProvider,
  SelectContextInput,
  SelectContextOutput
} from "../../types.js";

function requestDigest(request: JsonValue): `sha256:${string}` {
  return digestJson(request);
}

export class FakeResolvedPolicyProvider implements ResolvedPolicyProvider {
  resolve(input: ResolvePolicyInput): ResolvePolicyOutput {
    return {
      status: "unavailable",
      code: "NOT_IMPLEMENTED",
      replacementPort: "ResolvedPolicyProvider",
      requestDigest: requestDigest(input.request)
    };
  }
}

export class FakeContextSelectionProvider implements ContextSelectionProvider {
  select(input: SelectContextInput): SelectContextOutput {
    return {
      status: "unavailable",
      code: "NOT_IMPLEMENTED",
      replacementPort: "ContextSelectionProvider",
      requestDigest: requestDigest(input.request)
    };
  }
}

export class FakePlanEvidenceProvider implements PlanEvidenceProvider {
  createPlan(input: CreatePlanInput): CreatePlanOutput {
    return {
      status: "unavailable",
      code: "NOT_IMPLEMENTED",
      replacementPort: "PlanEvidenceProvider",
      requestDigest: requestDigest(input.request)
    };
  }

  getEvidence(input: GetEvidenceInput): GetEvidenceOutput {
    return {
      status: "unavailable",
      code: "NOT_IMPLEMENTED",
      replacementPort: "PlanEvidenceProvider",
      requestDigest: requestDigest(input.request)
    };
  }
}

export class DisabledApplyProvider implements ApplyProvider {
  apply(input: ApplyInput): ApplyOutput {
    return {
      status: "disabled",
      code: "NOT_IMPLEMENTED",
      replacementPort: "ApplyProvider",
      requestDigest: requestDigest(input.request)
    };
  }
}
