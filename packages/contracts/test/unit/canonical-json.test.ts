import { describe, expect, it } from "vitest";

import { canonicalJson, type JsonValue } from "../../src/index.js";

describe("canonicalJson", () => {
  it("sorts object keys recursively while preserving array order", () => {
    expect(
      canonicalJson({
        z: 1,
        a: {
          y: true,
          b: ["second", "first"]
        }
      })
    ).toBe('{"a":{"b":["second","first"],"y":true},"z":1}');
  });

  it("normalizes negative zero", () => {
    expect(canonicalJson(-0)).toBe("0");
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(
      "Canonical JSON does not support non-finite numbers."
    );
  });

  it("rejects cycles", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    expect(() => canonicalJson(cyclic as JsonValue)).toThrow(
      "Canonical JSON does not support cyclic objects."
    );
  });
});
