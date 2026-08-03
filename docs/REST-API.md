# REST API

REST endpoints are versioned under `/v1` and do not start a listener when modules are imported.

Endpoints:

- `GET /v1/health`
- `GET /v1/catalog/connectors`
- `GET /v1/catalog/connectors/:id`
- `GET /v1/connectors/:id/health`
- `POST /v1/projects/inspect`
- `POST /v1/routes`
- `POST /v1/policy/resolve`
- `POST /v1/locks/inspect`
- `POST /v1/context/select`
- `POST /v1/plans`
- `POST /v1/evidence/query`

Controls:

- POST requests require `application/json`.
- Request bodies are size-limited by `maxBodyBytes`.
- Requests are timeout-limited by `timeoutMs`.
- Responses use stable success and error envelopes.
- Error responses do not expose stack traces.
- Project inspection can be restricted by an allowed-root list.
- Correlation IDs are transport metadata and are excluded from canonical digests.

Authentication and authorization are provider-neutral ports:

- `RequestAuthenticator`
- `Authorizer`

The default test wiring is anonymous plus read-only authorization. `DenyByDefaultAuthorizer` is available for explicit denial tests and production-safe default composition.
