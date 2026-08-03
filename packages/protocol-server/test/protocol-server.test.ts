import { createServer } from "node:http";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createDefaultSorenApplication,
  DenyByDefaultAuthorizer,
  type Authorizer
} from "@soren-sdk/application";

import {
  createMcpSurface,
  createRestHandler,
  SUPPORTED_MCP_PROTOCOL_VERSIONS
} from "../src/index.js";

const repoRoot = resolve(process.cwd(), "../..");

interface RestJsonBody {
  data?: { status?: string };
  error?: { code?: string };
}

async function restRequest(
  path: string,
  init: {
    authorizer?: Authorizer;
    body?: string;
    headers?: Record<string, string>;
    method?: string;
  } = {}
) {
  const app = createDefaultSorenApplication(repoRoot);
  const handlerOptions = {
    application: app,
    allowedProjectRoots: [repoRoot],
    maxBodyBytes: 128
  };
  const server = createServer(
    createRestHandler({
      ...handlerOptions,
      ...(init.authorizer === undefined ? {} : { authorizer: init.authorizer })
    })
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected TCP listener.");
  }
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init);
    return { status: response.status, body: (await response.json()) as RestJsonBody };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  }
}

describe("REST protocol surface", () => {
  it("does not start a listener when imported and handles health explicitly", async () => {
    const response = await restRequest("/v1/health");
    expect(response.status).toBe(200);
    expect(response.body.data?.status).toBe("ok");
  });

  it("enforces JSON content type and body size limits", async () => {
    const wrongType = await restRequest("/v1/routes", {
      method: "POST",
      body: "{}"
    });
    const oversized = await restRequest("/v1/routes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(256) })
    });
    expect(wrongType.status).toBe(415);
    expect(wrongType.body.error?.code).toBe("CONTENT_TYPE_UNSUPPORTED");
    expect(oversized.status).toBe(413);
    expect(oversized.body.error?.code).toBe("BODY_TOO_LARGE");
  });

  it("blocks project inspection outside the allowlist", async () => {
    const response = await restRequest("/v1/projects/inspect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "/tmp" })
    });
    expect(response.status).toBe(403);
    expect(response.body.error?.code).toBe("PROJECT_ROOT_DENIED");
  });

  it("returns deterministic errors for unsupported endpoints and authorization denial", async () => {
    const unsupported = await restRequest("/v2/catalog/connectors");
    const denied = await restRequest("/v1/health", {
      authorizer: new DenyByDefaultAuthorizer()
    });
    expect(unsupported.status).toBe(404);
    expect(unsupported.body.error?.code).toBe("METHOD_NOT_FOUND");
    expect(denied.status).toBe(403);
    expect(denied.body.error?.code).toBe("AUTHORIZATION_DENIED");
  });
});

describe("MCP protocol surface", () => {
  it("declares read-only tools and rejects unsupported versions", async () => {
    const mcp = createMcpSurface(createDefaultSorenApplication(repoRoot));
    expect(mcp.tools().every((tool) => tool.readOnly)).toBe(true);
    await expect(
      mcp.callTool({ protocolVersion: "1900-01-01", toolName: "soren_catalog_list" })
    ).rejects.toMatchObject({
      code: "PROTOCOL_VERSION_UNSUPPORTED",
      status: 400
    });
  });

  it("routes tool calls through the application layer", async () => {
    const mcp = createMcpSurface(createDefaultSorenApplication(repoRoot));
    const result = await mcp.callTool({
      protocolVersion: SUPPORTED_MCP_PROTOCOL_VERSIONS[0],
      toolName: "soren_route",
      arguments: { text: "animate" }
    });
    expect(result).toMatchObject({ status: "unavailable", code: "NOT_IMPLEMENTED" });
  });

  it("returns deterministic errors for unknown MCP tools", async () => {
    const mcp = createMcpSurface(createDefaultSorenApplication(repoRoot));
    await expect(
      mcp.callTool({
        protocolVersion: SUPPORTED_MCP_PROTOCOL_VERSIONS[0],
        toolName: "soren_missing_tool"
      })
    ).rejects.toMatchObject({
      code: "METHOD_NOT_FOUND",
      status: 404
    });
  });
});
