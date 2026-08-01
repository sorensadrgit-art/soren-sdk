import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isAbsolute, relative, resolve } from "node:path";

import {
  AllowReadOnlyAuthorizer,
  AnonymousAuthenticator,
  ProtocolError,
  errorEnvelope,
  incomingRequest,
  okEnvelope,
  toProtocolError,
  type IncomingRequest,
  type JsonValue,
  type ProtocolMetadata
} from "@soren-sdk/application";

import type { RestHandler, RestServerOptions } from "./types.js";

const DEFAULT_MAX_BODY_BYTES = 1_048_576;
const DEFAULT_TIMEOUT_MS = 10_000;

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(",") : value;
}

function correlationId(request: IncomingMessage): string | undefined {
  return header(request, "x-soren-correlation-id");
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown
): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(value)}\n`);
}

async function readBody(
  request: IncomingMessage,
  maxBodyBytes: number
): Promise<JsonValue> {
  const contentType = header(request, "content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ProtocolError(
      "CONTENT_TYPE_UNSUPPORTED",
      "POST requests require application/json content type.",
      undefined,
      415
    );
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let aborted = request.destroyed;
  const onAborted = () => {
    aborted = true;
  };
  request.once("aborted", onAborted);
  try {
    for await (const chunk of request) {
      if (aborted) {
        throw new ProtocolError("REQUEST_CANCELLED", "Request was cancelled.", undefined, 499);
      }
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > maxBodyBytes) {
        throw new ProtocolError(
          "BODY_TOO_LARGE",
          "Request body exceeds the configured size limit.",
          { maxBodyBytes },
          413
        );
      }
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof ProtocolError) {
      throw error;
    }
    if (aborted) {
      throw new ProtocolError("REQUEST_CANCELLED", "Request was cancelled.", undefined, 499);
    }
    throw error;
  } finally {
    request.off("aborted", onAborted);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonValue;
  } catch {
    throw new ProtocolError("VALIDATION_FAILED", "Request body is not valid JSON.");
  }
}

function requestPath(request: IncomingMessage): string {
  return new URL(request.url ?? "/", "http://localhost").pathname;
}

function protocolMeta(request: IncomingMessage): ProtocolMetadata {
  const id = correlationId(request);
  return id === undefined ? { surface: "rest" } : { correlationId: id, surface: "rest" };
}

function assertAllowedProjectRoot(path: string, allowedRoots: string[]): void {
  const absolutePath = isAbsolute(path) ? resolve(path) : resolve(process.cwd(), path);
  const allowed = allowedRoots.some((configuredRoot) => {
    const contained = relative(resolve(configuredRoot), absolutePath);
    return contained === "" || (!contained.startsWith("..") && !isAbsolute(contained));
  });
  if (!allowed) {
    throw new ProtocolError(
      "PROJECT_ROOT_DENIED",
      "Project inspection path is outside the configured allowlist.",
      undefined,
      403
    );
  }
}

async function authorize(
  options: Required<Pick<RestServerOptions, "authenticator" | "authorizer">>,
  request: IncomingRequest,
  action: string,
  resource: string
): Promise<void> {
  const principal = await options.authenticator.authenticate(request);
  const decision = options.authorizer.authorize(principal, action, resource);
  if (!decision.allowed) {
    throw new ProtocolError(
      "AUTHORIZATION_DENIED",
      decision.reason ?? "Request is not authorized.",
      undefined,
      403
    );
  }
}

async function withTimeout<T>(
  timeoutMs: number,
  operation: () => Promise<T>
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new ProtocolError(
              "REQUEST_TIMEOUT",
              "Request exceeded the configured timeout.",
              { timeoutMs },
              504
            )
          );
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function routeName(path: string): string {
  return path.replace(/^\/v1\//, "").replace(/\/[^/]+$/, "");
}

export function createRestHandler(options: RestServerOptions): RestHandler {
  const authenticator = options.authenticator ?? new AnonymousAuthenticator();
  const authorizer = options.authorizer ?? new AllowReadOnlyAuthorizer();
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const allowedProjectRoots = options.allowedProjectRoots ?? [];

  return async (request: IncomingMessage, response: ServerResponse) => {
    const path = requestPath(request);
    const meta = protocolMeta(request);
    const protocolRequest = incomingRequest(request.method ?? "GET", path, {
      "content-type": header(request, "content-type"),
      "x-soren-correlation-id": meta.correlationId
    });

    try {
      const result = await withTimeout(timeoutMs, async () => {
        if (request.method === "GET" && path === "/v1/health") {
          await authorize({ authenticator, authorizer }, protocolRequest, "health:read", "health");
          return { status: 200, data: { status: "ok", versions: ["1.0.0-draft.1"] } };
        }
        if (request.method === "GET" && path === "/v1/catalog/connectors") {
          await authorize({ authenticator, authorizer }, protocolRequest, "catalog:read", "catalog");
          return { status: 200, data: await options.application.catalogList({ meta }) };
        }
        const catalogMatch = path.match(/^\/v1\/catalog\/connectors\/([^/]+)$/);
        if (request.method === "GET" && catalogMatch?.[1] !== undefined) {
          await authorize({ authenticator, authorizer }, protocolRequest, "catalog:read", routeName(path));
          return {
            status: 200,
            data: await options.application.catalogGet({ id: decodeURIComponent(catalogMatch[1]), meta })
          };
        }
        const healthMatch = path.match(/^\/v1\/connectors\/([^/]+)\/health$/);
        if (request.method === "GET" && healthMatch?.[1] !== undefined) {
          await authorize({ authenticator, authorizer }, protocolRequest, "connector:read", routeName(path));
          return {
            status: 200,
            data: await options.application.connectorHealth({
              id: decodeURIComponent(healthMatch[1]),
              meta
            })
          };
        }
        if (request.method !== "POST") {
          throw new ProtocolError("METHOD_NOT_FOUND", "Unsupported REST endpoint.", undefined, 404);
        }
        const body = await readBody(request, maxBodyBytes);
        await authorize({ authenticator, authorizer }, protocolRequest, `${routeName(path)}:read`, routeName(path));
        if (path === "/v1/projects/inspect") {
          if (typeof body !== "object" || body === null || Array.isArray(body)) {
            throw new ProtocolError("VALIDATION_FAILED", "Project inspection body must be an object.");
          }
          const projectPath = String((body as { path?: unknown }).path ?? "");
          assertAllowedProjectRoot(projectPath, allowedProjectRoots);
          return {
            status: 200,
            data: await options.application.inspectProject({ path: projectPath, meta })
          };
        }
        if (path === "/v1/routes") {
          return { status: 200, data: await options.application.route({ request: body, meta }) };
        }
        if (path === "/v1/policy/resolve") {
          return { status: 200, data: await options.application.resolvePolicy({ request: body, meta }) };
        }
        if (path === "/v1/locks/inspect") {
          return { status: 200, data: await options.application.inspectLock({ request: body, meta }) };
        }
        if (path === "/v1/context/select") {
          return { status: 200, data: await options.application.selectContext({ request: body, meta }) };
        }
        if (path === "/v1/plans") {
          return { status: 200, data: await options.application.createPlan({ request: body, meta }) };
        }
        if (path === "/v1/evidence/query") {
          return { status: 200, data: await options.application.getEvidence({ request: body, meta }) };
        }
        throw new ProtocolError("METHOD_NOT_FOUND", "Unsupported REST endpoint.", undefined, 404);
      });
      sendJson(response, result.status, okEnvelope(result.data, meta));
    } catch (error) {
      const protocolError = toProtocolError(error);
      sendJson(response, protocolError.status, errorEnvelope(protocolError, meta));
    }
  };
}

export function createProtocolHttpServer(options: RestServerOptions) {
  return createServer((request, response) => {
    void createRestHandler(options)(request, response);
  });
}
