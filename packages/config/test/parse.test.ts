import { describe, expect, it } from "vitest";
import {
  ConfigParseError,
  asPlainObject,
  parseJsonText,
  parseYamlText,
  rejectUnsafeKeys,
} from "../src/index.js";

function codeOf(fn: () => unknown): ConfigParseError["code"] | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    if (error instanceof ConfigParseError) {
      return error.code;
    }
    throw error;
  }
}

describe("safe YAML/JSON parsing", () => {
  it("parses valid YAML into a plain object", () => {
    const value = parseYamlText(
      "configId: web-platform\npreferences:\n  maxProviders: 1\n",
      "config.yaml"
    );
    expect(value).toEqual({
      configId: "web-platform",
      preferences: { maxProviders: 1 },
    });
  });

  it("parses valid JSON into a plain object", () => {
    const value = parseJsonText(
      '{"configId":"web-platform","maxProviders":1}',
      "config.json"
    );
    expect(value).toEqual({ configId: "web-platform", maxProviders: 1 });
  });

  it("rejects __proto__ keys at any depth", () => {
    const code = codeOf(() => parseYamlText("outer:\n  __proto__: 1\n", "config.yaml"));
    expect(code).toBe("CONFIG_UNSAFE_KEY");
  });

  it("rejects constructor and prototype keys", () => {
    expect(codeOf(() => parseYamlText("constructor: 1\n", "config.yaml"))).toBe(
      "CONFIG_UNSAFE_KEY"
    );
    expect(codeOf(() => parseJsonText('{"prototype":1}', "config.json"))).toBe(
      "CONFIG_UNSAFE_KEY"
    );
  });

  it("rejects alias bombs", () => {
    expect(codeOf(() => parseYamlText("a: &a [*a]\n", "config.yaml"))).toBe(
      "CONFIG_ALIAS"
    );
  });

  it("rejects duplicate mapping keys", () => {
    expect(codeOf(() => parseYamlText("a: 1\na: 2\n", "config.yaml"))).toBe(
      "CONFIG_DUPLICATE_KEY"
    );
  });

  it("rejects NaN and Infinity numeric literals", () => {
    expect(codeOf(() => parseYamlText("x: .nan\n", "config.yaml"))).toBe(
      "CONFIG_PARSE"
    );
    expect(codeOf(() => parseYamlText("x: .inf\n", "config.yaml"))).toBe(
      "CONFIG_PARSE"
    );
  });

  it("reports the source path on invalid syntax", () => {
    try {
      parseJsonText("{ not json", "config.json");
      throw new Error("expected CONFIG_PARSE");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigParseError);
      const err = error as ConfigParseError;
      expect(err.code).toBe("CONFIG_PARSE");
      expect(err.path).toBe("config.json");
    }
  });

  it("rejects non-object top-level values via asPlainObject", () => {
    expect(() => asPlainObject(parseJsonText("[1, 2]", "config.json"))).toThrow(
      /plain object/i
    );
    expect(() => asPlainObject(parseJsonText('"string"', "config.json"))).toThrow(
      /plain object/i
    );
  });

  it("rejectUnsafeKeys rejects NaN numbers", () => {
    expect(() => rejectUnsafeKeys({ x: Number.NaN }, "$")).toThrowError(
      ConfigParseError
    );
  });
});
