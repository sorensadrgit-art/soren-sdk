import { describe, expect, it } from "vitest";

import {
  ContractValidationError,
  validateContract
} from "../../src/index.js";

describe("ContractValidationError", () => {
  it("serializes to a valid error envelope", () => {
    const error = new ContractValidationError("Invalid.", [
      {
        instancePath: "/value",
        schemaPath: "#/properties/value",
        keyword: "type",
        message: "must be a string",
        params: { type: "string" }
      }
    ]);

    const envelope = error.toEnvelope();
    expect(validateContract("error-envelope", envelope).ok).toBe(true);
    expect(envelope.details).toEqual({ issueCount: 1 });
  });
});
