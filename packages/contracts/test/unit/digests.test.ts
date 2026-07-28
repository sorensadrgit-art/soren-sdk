import { describe, expect, it } from "vitest";

import { digestJson, sha256Bytes } from "../../src/index.js";

describe("digests", () => {
  it("produces the same digest regardless of object key order", () => {
    expect(digestJson({ a: 1, b: 2 })).toBe(digestJson({ b: 2, a: 1 }));
  });

  it("uses a prefixed lowercase SHA-256 digest", () => {
    expect(sha256Bytes("soren")).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
