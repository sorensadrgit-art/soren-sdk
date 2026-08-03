import { ProtocolError, type JsonValue } from "@soren-sdk/application";

import type { SorenClient, SorenClientOptions } from "./types.js";

async function readEnvelope<T>(response: Response): Promise<T> {
  const envelope = (await response.json()) as
    | { ok: true; data: T }
    | { ok: false; error: { code: string; message: string; details?: JsonValue } };
  if (envelope.ok) {
    return envelope.data;
  }
  throw new ProtocolError(
    envelope.error.code as never,
    envelope.error.message,
    envelope.error.details,
    response.status
  );
}

function jsonHeaders(correlationId: string | undefined): Record<string, string> {
  return correlationId === undefined
    ? { "content-type": "application/json" }
    : {
        "content-type": "application/json",
        "x-soren-correlation-id": correlationId
      };
}

function createHttpClient(options: Extract<SorenClientOptions, { transport: "http" }>): SorenClient {
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const get = async <T>(path: string): Promise<T> =>
    readEnvelope<T>(
      await fetchImpl(`${baseUrl}${path}`, {
        headers:
          options.correlationId === undefined
            ? {}
            : { "x-soren-correlation-id": options.correlationId }
      })
    );
  const post = async <T>(path: string, body: JsonValue): Promise<T> =>
    readEnvelope<T>(
      await fetchImpl(`${baseUrl}${path}`, {
        method: "POST",
        headers: jsonHeaders(options.correlationId),
        body: JSON.stringify(body)
      })
    );

  return {
    catalog: {
      list: () => get("/v1/catalog/connectors"),
      get: (id) => get(`/v1/catalog/connectors/${encodeURIComponent(id)}`)
    },
    connectors: {
      health: (id) => get(`/v1/connectors/${encodeURIComponent(id)}/health`)
    },
    projects: {
      inspect: (path) => post("/v1/projects/inspect", { path })
    },
    routes: {
      create: (request) => post("/v1/routes", request)
    },
    policy: {
      resolve: (request) => post("/v1/policy/resolve", request)
    },
    locks: {
      inspect: (request) => post("/v1/locks/inspect", request)
    },
    context: {
      select: (request) => post("/v1/context/select", request)
    },
    plans: {
      create: (request) => post("/v1/plans", request)
    },
    evidence: {
      get: (request) => post("/v1/evidence/query", request)
    }
  };
}

function createInProcessClient(
  options: Extract<SorenClientOptions, { transport: "in-process" }>
): SorenClient {
  const application = options.application;
  const meta = { surface: "sdk-in-process" as const };
  return {
    catalog: {
      list: () => application.catalogList({ meta }),
      get: (id) => application.catalogGet({ id, meta })
    },
    connectors: {
      health: (id) => application.connectorHealth({ id, meta })
    },
    projects: {
      inspect: (path) => application.inspectProject({ path, meta })
    },
    routes: {
      create: (request) => application.route({ request, meta })
    },
    policy: {
      resolve: (request) => application.resolvePolicy({ request, meta })
    },
    locks: {
      inspect: (request) => application.inspectLock({ request, meta })
    },
    context: {
      select: (request) => application.selectContext({ request, meta })
    },
    plans: {
      create: (request) => application.createPlan({ request, meta })
    },
    evidence: {
      get: (request) => application.getEvidence({ request, meta })
    }
  };
}

export function createSorenClient(options: SorenClientOptions): SorenClient {
  return options.transport === "in-process"
    ? createInProcessClient(options)
    : createHttpClient(options);
}
