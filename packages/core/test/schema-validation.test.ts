import { describe, expect, it } from "vitest";

import { validateJsonSchema } from "../src/schema-validation.js";

describe("Phase 7 JSON schema boundary", () => {
  const schema = {
    type: "object",
    required: ["path"],
    additionalProperties: false,
    properties: {
      path: { type: "string", minLength: 1, maxLength: 32 },
      limit: { type: "number", minimum: 0, maximum: 10 }
    }
  };

  it("accepts canonical JSON and rejects malformed or unsafe JSON-shaped values", () => {
    expect(validateJsonSchema(schema, { path: "src", limit: 1 }).ok).toBe(true);
    expect(validateJsonSchema(schema, {}).ok).toBe(false);
    expect(validateJsonSchema(schema, { path: "src", extra: true }).ok).toBe(false);
    expect(validateJsonSchema(schema, { path: "src", limit: Number.NaN }).ok).toBe(false);
    expect(validateJsonSchema(schema, { path: "src", __proto__: { polluted: true } }).ok).toBe(false);
  });
});
