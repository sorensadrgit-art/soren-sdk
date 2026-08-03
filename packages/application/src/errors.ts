import { digestJson, type JsonValue } from "@soren-sdk/contracts";

import type {
  ProtocolEnvelope,
  ProtocolErrorCode,
  ProtocolErrorEnvelope,
  ProtocolMetadata
} from "./types.js";

export class ProtocolError extends Error {
  override readonly name = "ProtocolError";

  constructor(
    readonly code: ProtocolErrorCode,
    message: string,
    readonly details?: JsonValue,
    readonly status = 400
  ) {
    super(message);
  }
}

export function okEnvelope<T>(
  data: T,
  meta: ProtocolMetadata = {}
): ProtocolEnvelope<T> {
  return {
    schemaVersion: "1.0.0-draft.1",
    ok: true,
    data,
    meta
  };
}

export function errorEnvelope(
  error: ProtocolError,
  meta: ProtocolMetadata = {}
): ProtocolErrorEnvelope {
  return {
    schemaVersion: "1.0.0-draft.1",
    ok: false,
    error:
      error.details === undefined
        ? { code: error.code, message: error.message }
        : { code: error.code, message: error.message, details: error.details },
    meta
  };
}

export function canonicalProtocolDigest(value: unknown): string {
  const stripped = stripTransportMetadata(value);
  return digestJson(stripped as JsonValue);
}

export function stripTransportMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripTransportMetadata);
  }
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === "meta" || key === "correlationId") {
        continue;
      }
      output[key] = stripTransportMetadata(entry);
    }
    return output;
  }
  return value;
}

export function toProtocolError(error: unknown): ProtocolError {
  if (error instanceof ProtocolError) {
    return error;
  }
  return new ProtocolError(
    "INTERNAL_ERROR",
    "Soren SDK request failed.",
    undefined,
    500
  );
}
