import { digestJson, type Digest, type JsonValue } from "@soren-sdk/contracts";

import { inventoryDigest, type ToolInventory } from "./context-gateway.js";

export interface ProtocolNegotiation {
  readonly providerId: string;
  readonly inventoryDigest: Digest;
  readonly protocolVersion: string;
  readonly extensions: readonly string[];
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly digest: Digest;
}

const dateVersion = /^\d{4}-\d{2}-\d{2}$/;

function nonEmpty(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${name} must be non-empty.`);
}

function validVersion(value: string): void {
  nonEmpty(value, "protocol version");
  if (!dateVersion.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new TypeError("Invalid protocol version.");
  }
}

function validTime(value: string, name: string): number {
  nonEmpty(value, name);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${name} must be a valid timestamp.`);
  return parsed;
}

function normalized(values: readonly string[], name: string, validate: (value: string) => void): readonly string[] {
  for (const value of values) {
    try {
      validate(value);
    } catch {
      throw new TypeError(`Invalid ${name}.`);
    }
  }
  return Object.freeze([...new Set(values)].sort((left, right) => left.localeCompare(right)));
}

export function validateInventory(inventory: ToolInventory): void {
  nonEmpty(inventory.providerId, "providerId");
  if (!Array.isArray(inventory.protocolVersions) || inventory.protocolVersions.length === 0) {
    throw new TypeError("Tool inventory must provide protocol versions.");
  }
  normalized(inventory.protocolVersions, "protocol version", validVersion);
  normalized(inventory.extensions ?? [], "extension", (value) => nonEmpty(value, "extension"));
  const toolIds = new Set<string>();
  for (const tool of inventory.tools) {
    nonEmpty(tool.id, "tool id");
    if (toolIds.has(tool.id)) throw new TypeError("Tool inventory has duplicate tool IDs.");
    toolIds.add(tool.id);
    nonEmpty(tool.description, "tool description");
    if (typeof tool.readOnly !== "boolean" || typeof tool.exposesProjectContent !== "boolean") throw new TypeError("Tool inventory has invalid classification.");
  }
}

export function negotiateProtocol(
  inventory: ToolInventory,
  callerVersions: readonly string[],
  requiredExtensions: readonly string[],
  issuedAt: string,
  expiresAt: string
): ProtocolNegotiation {
  validateInventory(inventory);
  const issued = validTime(issuedAt, "issuedAt");
  const expires = validTime(expiresAt, "expiresAt");
  if (expires <= issued) throw new TypeError("Protocol negotiation expires before issuance.");
  const providerVersions = normalized(inventory.protocolVersions, "protocol version", validVersion);
  const acceptedVersions = new Set(normalized(callerVersions, "protocol version", validVersion));
  const protocolVersion = [...providerVersions].filter((value) => acceptedVersions.has(value)).sort((left, right) => right.localeCompare(left))[0];
  if (protocolVersion === undefined) throw new TypeError("No compatible protocol version.");
  const extensions = normalized(requiredExtensions, "extension", (value) => nonEmpty(value, "extension"));
  const available = new Set(inventory.extensions ?? []);
  for (const extension of extensions) {
    if (!available.has(extension)) throw new TypeError("Required extension is not supported.");
  }
  const digest = inventoryDigest(inventory);
  const preimage = {
    providerId: inventory.providerId, inventoryDigest: digest, protocolVersion,
    extensions: [...extensions], issuedAt, expiresAt
  };
  return Object.freeze({ ...preimage, digest: digestJson(preimage as JsonValue) });
}
