import type { ErrorEnvelope, JsonValue } from "../types/index.js";
import type { SorenErrorCode } from "./codes.js";

export interface ContractIssue {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message: string;
  params: Record<string, JsonValue>;
}

export class ContractValidationError extends Error {
  readonly code: SorenErrorCode = "VALIDATION_FAILED";
  readonly issues: readonly ContractIssue[];

  constructor(message: string, issues: readonly ContractIssue[]) {
    super(message);
    this.name = "ContractValidationError";
    this.issues = issues;
  }

  toEnvelope(): ErrorEnvelope {
    return {
      schemaVersion: "1.0.0-draft.1",
      contractKind: "error-envelope",
      code: this.code,
      message: this.message,
      safeToContinue: false,
      details: {
        issueCount: this.issues.length
      }
    };
  }
}
