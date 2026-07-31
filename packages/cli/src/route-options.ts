import { parseArgs } from "node:util";

import {
  canonicalJson,
  digestJson,
  type Digest,
  type JsonValue,
  type RouteRequest
} from "@soren-sdk/contracts";

export interface ParsedRouteOptions {
  project: string;
  capabilities: RouteRequest["capabilities"];
  preferredProviders: string[];
  forbiddenProviders: string[];
  maxProviders: number;
  json: boolean;
}

const ROUTE_OPTIONS = {
  project: { type: "string", default: "." },
  capability: { type: "string", multiple: true },
  optional: { type: "string", multiple: true },
  preferred: { type: "string", multiple: true },
  forbidden: { type: "string", multiple: true },
  "max-providers": { type: "string", default: "2" },
  scope: { type: "string" },
  property: { type: "string" },
  json: { type: "boolean", default: false }
} as const;

function nonEmpty(values: string[] | undefined, option: string): string[] {
  return (values ?? []).map((value) => {
    const normalized = value.trim();
    if (normalized === "") {
      throw new TypeError(`${option} values must not be empty.`);
    }
    return normalized;
  });
}

function optionalString(value: string | undefined, option: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized === "") {
    throw new TypeError(`${option} must not be empty.`);
  }
  return normalized;
}

function parseProviderLimit(value: string): number {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new TypeError("--max-providers must be a non-negative integer.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new TypeError("--max-providers must be a non-negative integer.");
  }
  return parsed;
}

function capability(
  id: string,
  required: boolean,
  scope: string | undefined,
  property: string | undefined
): RouteRequest["capabilities"][number] {
  if (scope === undefined && property === undefined) {
    return { id, required };
  }
  return {
    id,
    required,
    quality: {
      ...(property === undefined ? {} : { property }),
      ...(scope === undefined ? {} : { scope })
    }
  };
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function normalizedCapabilities(
  capabilities: RouteRequest["capabilities"]
): RouteRequest["capabilities"] {
  return capabilities
    .map((item) => ({
      id: item.id,
      required: item.required,
      ...(item.quality === undefined
        ? {}
        : {
            quality: Object.fromEntries(
              Object.entries(item.quality).sort(([left], [right]) =>
                left.localeCompare(right)
              )
            )
          })
    }))
    .sort((left, right) =>
      [left.id, left.required ? "0" : "1", canonicalJson(asJsonValue(left.quality ?? {}))]
        .join("\0")
        .localeCompare(
          [
            right.id,
            right.required ? "0" : "1",
            canonicalJson(asJsonValue(right.quality ?? {}))
          ].join("\0")
        )
    );
}

export function parseRouteOptions(args: string[]): ParsedRouteOptions {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    strict: true,
    options: ROUTE_OPTIONS
  });
  const required = nonEmpty(parsed.values.capability, "--capability");
  const optional = nonEmpty(parsed.values.optional, "--optional");
  if (required.length + optional.length === 0) {
    throw new TypeError("route requires at least one capability.");
  }
  const scope = optionalString(parsed.values.scope, "--scope");
  const property = optionalString(parsed.values.property, "--property");
  const project = optionalString(parsed.values.project, "--project") ?? ".";

  return {
    project,
    capabilities: [
      ...required.map((id) => capability(id, true, scope, property)),
      ...optional.map((id) => capability(id, false, scope, property))
    ],
    preferredProviders: nonEmpty(parsed.values.preferred, "--preferred"),
    forbiddenProviders: nonEmpty(parsed.values.forbidden, "--forbidden"),
    maxProviders: parseProviderLimit(parsed.values["max-providers"] ?? "2"),
    json: parsed.values.json ?? false
  };
}

function asJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

export function buildRouteRequest(
  options: ParsedRouteOptions,
  projectSnapshotId: Digest,
  createdAt: string
): RouteRequest {
  const capabilities = normalizedCapabilities(options.capabilities);
  const preferredProviders = stableUnique(options.preferredProviders);
  const forbiddenProviders = [...new Set(options.forbiddenProviders)].sort();
  const input = {
    projectSnapshotId,
    capabilities,
    preferredProviders,
    forbiddenProviders,
    maxProviders: options.maxProviders
  };
  const digest = digestJson(asJsonValue(input));
  const required = capabilities
    .filter((item) => item.required)
    .map((item) => item.id);
  const optional = capabilities
    .filter((item) => !item.required)
    .map((item) => item.id);
  const summary = [
    `required: ${required.join(", ") || "none"}`,
    `optional: ${optional.join(", ") || "none"}`
  ].join("; ");

  return {
    schemaVersion: "1.0.0-draft.1",
    contractKind: "route-request",
    requestId: `route_request_${digest.slice("sha256:".length, "sha256:".length + 24)}`,
    createdAt,
    projectSnapshotId,
    summary,
    capabilities,
    preferences: {
      preferredProviders,
      forbiddenProviders,
      maxProviders: options.maxProviders,
      allowPaidServices: false,
      allowExperimental: false
    }
  };
}
