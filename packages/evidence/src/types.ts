import type {
  EvidenceEnvelope,
  RunnerResult,
  VerificationState,
  VerificationPlan
} from "@soren-sdk/contracts";
import type { ExecutionPlan } from "@soren-sdk/planner";

export type { EvidenceCheck, EvidenceEnvelope } from "@soren-sdk/contracts";

export interface RunnerResultSource {
  list(planId: string): RunnerResult[];
}

export interface IngestRunnerResultInput {
  plan: ExecutionPlan;
  verificationPlan: VerificationPlan;
  results: RunnerResult[];
  artifactContents?: Record<string, string | Uint8Array>;
}

export interface EvidenceVerificationResult {
  ok: boolean;
  issues: string[];
}

export interface EvidenceQuery {
  evidence: EvidenceEnvelope;
}

export interface EvidenceSummary {
  total: number;
  byStatus: Record<VerificationState, number>;
  requiredComplete: boolean;
  failed: string[];
}

export interface EvidenceService {
  ingest(input: IngestRunnerResultInput): EvidenceEnvelope;
  verify(evidence: unknown): EvidenceVerificationResult;
  summarize(query: EvidenceQuery): EvidenceSummary;
}
