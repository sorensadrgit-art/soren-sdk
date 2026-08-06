import { Ajv } from "ajv";

export interface SchemaValidationResult {
  readonly ok: boolean;
  readonly code?: "INVALID_JSON" | "INVALID_SCHEMA" | "SCHEMA_FAILED";
}

const dangerousKeys = new Set(["__proto__", "prototype", "constructor"]);

function assertJson(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite JSON number.");
    return;
  }
  if (typeof value !== "object") throw new TypeError("Value is not JSON.");
  if (seen.has(value)) throw new TypeError("Cyclic JSON value.");
  if (Array.isArray(value)) {
    seen.add(value);
    for (const item of value) assertJson(item, seen);
    seen.delete(value);
    return;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError("JSON object must be plain.");
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || dangerousKeys.has(key)) throw new TypeError("Unsafe JSON object key.");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) throw new TypeError("JSON accessors are not supported.");
    assertJson(descriptor.value, seen);
  }
  seen.delete(value);
}

export function validateJsonSchema(schema: object | boolean, value: unknown): SchemaValidationResult {
  try {
    assertJson(schema);
  } catch {
    return { ok: false, code: "INVALID_SCHEMA" };
  }
  try {
    assertJson(value);
  } catch {
    return { ok: false, code: "INVALID_JSON" };
  }
  try {
    const validator = new Ajv({ allErrors: true, strict: true }).compile(schema);
    return validator(value) ? { ok: true } : { ok: false, code: "SCHEMA_FAILED" };
  } catch {
    return { ok: false, code: "INVALID_SCHEMA" };
  }
}
