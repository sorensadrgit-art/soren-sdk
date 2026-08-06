import type { EvidenceEnvelope } from "@soren-sdk/contracts";

import { ingestEvidence } from "./ingest.js";
import { summarizeEvidence, verifyEvidence } from "./verify.js";
import type {
  EvidenceQuery,
  EvidenceService,
  EvidenceSummary,
  EvidenceVerificationResult,
  IngestRunnerResultInput
} from "./types.js";

export type {
  EvidenceCheck,
  EvidenceEnvelope,
  EvidenceQuery,
  EvidenceService,
  EvidenceSummary,
  EvidenceVerificationResult,
  IngestRunnerResultInput,
  RunnerResultSource
} from "./types.js";

export class DeterministicEvidenceService implements EvidenceService {
  ingest(input: IngestRunnerResultInput): EvidenceEnvelope {
    return ingestEvidence(input);
  }

  verify(evidence: unknown): EvidenceVerificationResult {
    return verifyEvidence(evidence);
  }

  summarize(query: EvidenceQuery): EvidenceSummary {
    return summarizeEvidence(query.evidence);
  }
}
