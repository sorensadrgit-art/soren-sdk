import { JSON_SCHEMA, load as yamlLoad } from "js-yaml";
import { ConfigParseError } from "./errors.js";

/**
 * A JSON-compatible value: the only shape we accept from untrusted
 * YAML/JSON documents before projecting them onto a contract type.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * YAML anchors/aliases (`&name` / `*name`) are rejected outright. Even with
 * `maxAliasCount: 0`, a self-referential anchor can produce a circular object
 * graph (an "alias bomb"), so we refuse the tokens before parsing.
 */
const YAML_ALIAS_TOKEN = /[&*][A-Za-z_][A-Za-z0-9_-]*/;

/**
 * YAML 1.1 non-JSON numeric literals (`.nan`, `.inf`, `+.inf`, `-.inf`).
 * Under JSON_SCHEMA they silently coerce to `null`; we reject them outright so
 * a value can never be quietly dropped or type-confused.
 */
const NON_JSON_NUMERIC = /[+-]?\.(?:inf|nan)\b/i;

const DUPLICATE_KEY_MESSAGE = /duplicated mapping key/i;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Recursively validate an untrusted value, rejecting prototype-pollution keys,
 * non-finite numbers, non-plain objects, and any unsupported value type.
 */
export function rejectUnsafeKeys(value: unknown, path = "$"): JsonValue {
  if (value === null) {
    return null;
  }
  if (typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      throw new ConfigParseError(
        "CONFIG_PARSE",
        `non-finite number at ${path}`,
        path
      );
    }
    return value;
  }
  if (Array.isArray(value)) {
    const out: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      out.push(rejectUnsafeKeys(value[index], `${path}[${index}]`));
    }
    return out;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ConfigParseError(
        "CONFIG_PARSE",
        `non-plain object at ${path}`,
        path
      );
    }
    const out: { [key: string]: JsonValue } = {};
    for (const [key, child] of Object.entries(value)) {
      if (UNSAFE_KEYS.has(key)) {
        throw new ConfigParseError(
          "CONFIG_UNSAFE_KEY",
          `unsafe key "${key}" at ${path}.${key}`,
          `${path}.${key}`
        );
      }
      out[key] = rejectUnsafeKeys(child, `${path}.${key}`);
    }
    return out;
  }
  throw new ConfigParseError(
    "CONFIG_PARSE",
    `unsupported value of type ${typeof value} at ${path}`,
    path
  );
}

/** Parse JSON text into a validated JSON value. */
export function parseJsonText(text: string, source: string): JsonValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ConfigParseError(
      "CONFIG_PARSE",
      `invalid JSON in ${source}: ${messageOf(error)}`,
      source
    );
  }
  return rejectUnsafeKeys(parsed, "$");
}

/**
 * Parse YAML text into a validated JSON value. We restrict to JSON_SCHEMA,
 * reject aliases/anchors and non-JSON numeric literals before parsing, and map
 * js-yaml failures onto `ConfigParseError` codes.
 */
export function parseYamlText(text: string, source: string): JsonValue {
  if (YAML_ALIAS_TOKEN.test(text)) {
    throw new ConfigParseError(
      "CONFIG_ALIAS",
      `YAML anchors/aliases are not permitted in ${source}`,
      source
    );
  }
  if (NON_JSON_NUMERIC.test(text)) {
    throw new ConfigParseError(
      "CONFIG_PARSE",
      `non-JSON numeric literal (NaN/Infinity) is not permitted in ${source}`,
      source
    );
  }
  let parsed: unknown;
  try {
    parsed = yamlLoad(text, {
      schema: JSON_SCHEMA,
      maxAliasCount: 0,
      filename: source,
    });
  } catch (error) {
    const message = messageOf(error);
    if (DUPLICATE_KEY_MESSAGE.test(message)) {
      throw new ConfigParseError(
        "CONFIG_DUPLICATE_KEY",
        `duplicated mapping key in ${source}: ${message}`,
        source
      );
    }
    throw new ConfigParseError(
      "CONFIG_PARSE",
      `invalid YAML in ${source}: ${message}`,
      source
    );
  }
  return rejectUnsafeKeys(parsed, "$");
}

/** Assert that a parsed JSON value is a plain object. */
export function asPlainObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ConfigParseError(
      "CONFIG_PARSE",
      "expected a plain object at the top level",
      "$"
    );
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ConfigParseError(
      "CONFIG_PARSE",
      "expected a plain object at the top level",
      "$"
    );
  }
  return value as Record<string, unknown>;
}
