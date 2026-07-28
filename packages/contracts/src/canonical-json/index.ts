import type { JsonValue } from "../types/index.js";

function assertJsonNumber(value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError("Canonical JSON does not support non-finite numbers.");
  }
}

function serialize(value: JsonValue, seen: Set<object>): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    assertJsonNumber(value);
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError("Canonical JSON does not support cyclic arrays.");
    }

    seen.add(value);
    const result = `[${value.map((item) => serialize(item, seen)).join(",")}]`;
    seen.delete(value);
    return result;
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      throw new TypeError("Canonical JSON does not support cyclic objects.");
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON accepts only plain objects.");
    }

    seen.add(value);
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serialize(value[key] as JsonValue, seen)}`);
    seen.delete(value);
    return `{${entries.join(",")}}`;
  }

  throw new TypeError("Value is not valid JSON.");
}

export function canonicalJson(value: JsonValue): string {
  return serialize(value, new Set<object>());
}
