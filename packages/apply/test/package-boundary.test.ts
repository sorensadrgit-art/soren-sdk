import { describe, expect, it } from "vitest";

import * as publicApplyApi from "../src/public.js";

describe("@soren-sdk/apply public package boundary", () => {
  it("does not expose test-only apply enablement", () => {
    expect(publicApplyApi).not.toHaveProperty("createApplyServiceForTesting");
    expect(publicApplyApi).not.toHaveProperty("TEST_APPLY_CAPABILITY");
  });
});
