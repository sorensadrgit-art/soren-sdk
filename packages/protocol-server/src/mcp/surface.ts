import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import {
  ProtocolError,
  type JsonValue,
  type ProtocolMetadata,
  type SorenApplication
} from "@soren-sdk/application";

export const SUPPORTED_MCP_PROTOCOL_VERSIONS = ["2025-06-18"] as const;

export interface McpTool {
  name: string;
  description: string;
  readOnly: true;
  available: boolean;
}

export interface McpResource {
  uri: string;
  name: string;
  mimeType: "application/json";
}

export interface McpRequest {
  protocolVersion: string;
  toolName: string;
  arguments?: JsonValue;
  correlationId?: string;
}

export interface McpSurface {
  protocolVersions: readonly string[];
  tools(): McpTool[];
  resources(): McpResource[];
  callTool(request: McpRequest): Promise<JsonValue>;
}

export interface McpSurfaceOptions { allowedProjectRoots?: string[]; }

function assertAllowedProjectRoot(path: string, allowedRoots: readonly string[]): void {
  if (allowedRoots.length === 0) throw new ProtocolError("PROJECT_ROOT_DENIED", "Project inspection path is outside the configured allowlist.", undefined, 403);
  const candidate = realpathSync(isAbsolute(path) ? path : resolve(process.cwd(), path));
  const allowed = allowedRoots.some((root) => {
    const contained = relative(realpathSync(resolve(root)), candidate);
    return contained === "" || (!contained.startsWith("..") && !isAbsolute(contained));
  });
  if (!allowed) throw new ProtocolError("PROJECT_ROOT_DENIED", "Project inspection path is outside the configured allowlist.", undefined, 403);
}

const toolDescriptions: McpTool[] = [
  { name: "soren_catalog_list", description: "List Soren connectors.", readOnly: true, available: true },
  { name: "soren_catalog_get", description: "Get a Soren connector by id.", readOnly: true, available: true },
  { name: "soren_connector_health", description: "Inspect connector health.", readOnly: true, available: true },
  { name: "soren_project_inspect", description: "Inspect a project snapshot.", readOnly: true, available: true },
  { name: "soren_route", description: "Route a request through the application boundary.", readOnly: true, available: false },
  { name: "soren_policy_resolve", description: "Resolve policy through the Phase 5 port.", readOnly: true, available: false },
  { name: "soren_lock_inspect", description: "Inspect a Soren lock request.", readOnly: true, available: false },
  { name: "soren_context_select", description: "Select context through the Phase 7 port.", readOnly: true, available: false },
  { name: "soren_plan_create", description: "Create a plan through the Phase 8 port.", readOnly: true, available: false },
  { name: "soren_evidence_query", description: "Query evidence through the Phase 8 port.", readOnly: true, available: false }
];

function assertVersion(protocolVersion: string): void {
  if (!SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(protocolVersion as never)) {
    throw new ProtocolError(
      "PROTOCOL_VERSION_UNSUPPORTED",
      "Unsupported MCP protocol version.",
      { supported: [...SUPPORTED_MCP_PROTOCOL_VERSIONS] },
      400
    );
  }
}

function objectArgument(argumentsValue: JsonValue | undefined): Record<string, JsonValue> {
  if (argumentsValue === undefined) {
    return {};
  }
  if (
    typeof argumentsValue !== "object" ||
    argumentsValue === null ||
    Array.isArray(argumentsValue)
  ) {
    throw new ProtocolError("VALIDATION_FAILED", "MCP tool arguments must be an object.");
  }
  return argumentsValue as Record<string, JsonValue>;
}

function protocolMeta(correlationId: string | undefined): ProtocolMetadata {
  return correlationId === undefined
    ? { surface: "mcp" }
    : { correlationId, surface: "mcp" };
}

function jsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

export function createMcpSurface(application: SorenApplication, options: McpSurfaceOptions = {}): McpSurface {
  const allowedProjectRoots = options.allowedProjectRoots ?? [];
  return {
    protocolVersions: SUPPORTED_MCP_PROTOCOL_VERSIONS,
    tools() {
      return toolDescriptions;
    },
    resources() {
      return [
        {
          uri: "soren://catalog/connectors",
          name: "Soren connector catalog",
          mimeType: "application/json"
        },
        {
          uri: "soren://protocol/capabilities",
          name: "Soren protocol capabilities",
          mimeType: "application/json"
        }
      ];
    },
    async callTool(request) {
      assertVersion(request.protocolVersion);
      const args = objectArgument(request.arguments);
      const meta = protocolMeta(request.correlationId);
      if (request.toolName === "soren_catalog_list") {
        return jsonValue(await application.catalogList({ meta }));
      }
      if (request.toolName === "soren_catalog_get") {
        return jsonValue(await application.catalogGet({ id: String(args.id ?? ""), meta }));
      }
      if (request.toolName === "soren_connector_health") {
        return jsonValue(await application.connectorHealth({ id: String(args.id ?? ""), meta }));
      }
      if (request.toolName === "soren_project_inspect") {
        const path = args.path;
        if (typeof path !== "string" || path.trim() === "") {
          throw new ProtocolError("VALIDATION_FAILED", "Project inspection path must be a nonempty string.");
        }
        assertAllowedProjectRoot(path, allowedProjectRoots);
        return jsonValue(await application.inspectProject({ path, meta }));
      }
      if (request.toolName === "soren_route") {
        return jsonValue(await application.route({ request: args, meta }));
      }
      if (request.toolName === "soren_policy_resolve") {
        return jsonValue(await application.resolvePolicy({ request: args, meta }));
      }
      if (request.toolName === "soren_lock_inspect") {
        return jsonValue(await application.inspectLock({ request: args, meta }));
      }
      if (request.toolName === "soren_context_select") {
        return jsonValue(await application.selectContext({ request: args, meta }));
      }
      if (request.toolName === "soren_plan_create") {
        return jsonValue(await application.createPlan({ request: args, meta }));
      }
      if (request.toolName === "soren_evidence_query") {
        return jsonValue(await application.getEvidence({ request: args, meta }));
      }
      throw new ProtocolError("METHOD_NOT_FOUND", "Unknown MCP tool.", undefined, 404);
    }
  };
}
