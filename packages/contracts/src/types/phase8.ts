import type { Digest } from "./contracts.js";
import type { JsonValue } from "./json.js";

export type VerificationState =
  | "passed"
  | "failed"
  | "not-run"
  | "not-required"
  | "blocked"
  | "cancelled"
  | "timed-out"
  | "unverified";

export interface ArtifactReference {
  id: string;
  uri: string;
  digest: Digest;
  mediaType?: string;
  bytes?: number;
}

export interface VerificationPlan {
  schemaVersion: "1.0.0-draft.1";
  contractKind: "verification-plan";
  verificationPlanId: string;
  executionPlanId: string;
  executionPlanDigest: Digest;
  checks: Array<{
    id: string;
    kind: string;
    required: boolean;
    status: VerificationState;
    reason?: string;
    artifacts?: string[];
  }>;
  digest: Digest;
}

export interface RunnerResult {
  runner: { id: string; version: string; attestation?: Record<string, JsonValue> };
  planId: string;
  planDigest: Digest;
  checkId: string;
  startedAt: string;
  completedAt: string;
  status: VerificationState;
  exitCode: number | null;
  diagnostics: Array<{ code: string; message: string }>;
  artifacts: ArtifactReference[];
  environment: Record<string, JsonValue>;
  redactions: string[];
}
