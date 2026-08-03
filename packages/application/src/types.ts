import type {
  CatalogSnapshot,
  ConnectorManifest,
  Digest,
  JsonValue,
  ProjectSnapshot
} from "@soren-sdk/contracts";
import type { ConnectorHealthReport, ConnectorRecord } from "@soren-sdk/core";

export type ProtocolErrorCode =
  | "AUTHENTICATION_FAILED"
  | "AUTHORIZATION_DENIED"
  | "BODY_TOO_LARGE"
  | "CONTENT_TYPE_UNSUPPORTED"
  | "INTERNAL_ERROR"
  | "INVALID_ARGUMENT"
  | "METHOD_NOT_FOUND"
  | "NOT_IMPLEMENTED"
  | "PROJECT_ROOT_DENIED"
  | "PROTOCOL_VERSION_UNSUPPORTED"
  | "REQUEST_CANCELLED"
  | "REQUEST_TIMEOUT"
  | "VALIDATION_FAILED";

export interface ProtocolMetadata {
  correlationId?: string;
  surface?: "application" | "mcp" | "rest" | "sdk-http" | "sdk-in-process";
}

export interface ProtocolEnvelope<T> {
  schemaVersion: "1.0.0-draft.1";
  ok: true;
  data: T;
  meta: ProtocolMetadata;
}

export interface ProtocolErrorEnvelope {
  schemaVersion: "1.0.0-draft.1";
  ok: false;
  error: {
    code: ProtocolErrorCode;
    message: string;
    details?: JsonValue;
  };
  meta: ProtocolMetadata;
}

export interface IncomingRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  remoteAddress?: string;
}

export interface AuthenticatedPrincipal {
  id: string;
  roles: string[];
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
}

export interface RequestAuthenticator {
  authenticate(request: IncomingRequest): Promise<AuthenticatedPrincipal>;
}

export interface Authorizer {
  authorize(
    principal: AuthenticatedPrincipal,
    action: string,
    resource: string
  ): AuthorizationDecision;
}

export interface CatalogListInput {
  meta?: ProtocolMetadata;
}

export interface CatalogListOutput {
  connectors: ConnectorRecord[];
  snapshot: CatalogSnapshot;
}

export interface CatalogGetInput {
  id: string;
  meta?: ProtocolMetadata;
}

export interface CatalogGetOutput {
  connector: ConnectorRecord | null;
}

export interface ConnectorHealthInput {
  id: string;
  meta?: ProtocolMetadata;
}

export interface ConnectorHealthOutput {
  health: ConnectorHealthReport;
}

export interface InspectProjectInput {
  path: string;
  createdAt?: string;
  meta?: ProtocolMetadata;
}

export interface InspectProjectOutput {
  project: ProjectSnapshot;
}

export interface RouteUseCaseInput {
  request: JsonValue;
  meta?: ProtocolMetadata;
}

export interface RouteUseCaseOutput {
  status: "unavailable";
  code: "NOT_IMPLEMENTED";
  replacementPhase: "phase-4";
  requestDigest: Digest;
}

export interface ResolvePolicyInput {
  request: JsonValue;
  meta?: ProtocolMetadata;
}

export interface ResolvePolicyOutput {
  status: "unavailable";
  code: "NOT_IMPLEMENTED";
  replacementPort: "ResolvedPolicyProvider";
  requestDigest: Digest;
}

export interface InspectLockInput {
  request: JsonValue;
  meta?: ProtocolMetadata;
}

export interface InspectLockOutput {
  status: "unavailable";
  code: "NOT_IMPLEMENTED";
  requestDigest: Digest;
}

export interface SelectContextInput {
  request: JsonValue;
  meta?: ProtocolMetadata;
}

export interface SelectContextOutput {
  status: "unavailable";
  code: "NOT_IMPLEMENTED";
  replacementPort: "ContextSelectionProvider";
  requestDigest: Digest;
}

export interface CreatePlanInput {
  request: JsonValue;
  meta?: ProtocolMetadata;
}

export interface CreatePlanOutput {
  status: "unavailable";
  code: "NOT_IMPLEMENTED";
  replacementPort: "PlanEvidenceProvider";
  requestDigest: Digest;
}

export interface GetEvidenceInput {
  request: JsonValue;
  meta?: ProtocolMetadata;
}

export interface GetEvidenceOutput {
  status: "unavailable";
  code: "NOT_IMPLEMENTED";
  replacementPort: "PlanEvidenceProvider";
  requestDigest: Digest;
}

export interface ApplyInput {
  request: JsonValue;
  meta?: ProtocolMetadata;
}

export interface ApplyOutput {
  status: "disabled";
  code: "NOT_IMPLEMENTED";
  replacementPort: "ApplyProvider";
  requestDigest: Digest;
}

export interface SorenApplication {
  catalogList(input: CatalogListInput): Promise<CatalogListOutput>;
  catalogGet(input: CatalogGetInput): Promise<CatalogGetOutput>;
  connectorHealth(input: ConnectorHealthInput): Promise<ConnectorHealthOutput>;
  inspectProject(input: InspectProjectInput): Promise<InspectProjectOutput>;
  route(input: RouteUseCaseInput): Promise<RouteUseCaseOutput>;
  resolvePolicy(input: ResolvePolicyInput): Promise<ResolvePolicyOutput>;
  inspectLock(input: InspectLockInput): Promise<InspectLockOutput>;
  selectContext(input: SelectContextInput): Promise<SelectContextOutput>;
  createPlan(input: CreatePlanInput): Promise<CreatePlanOutput>;
  getEvidence(input: GetEvidenceInput): Promise<GetEvidenceOutput>;
}

export interface CatalogProvider {
  listConnectors(): ConnectorRecord[];
  getConnector(connectorId: string): ConnectorRecord | undefined;
  getConnectorHealth(connectorId: string): ConnectorHealthReport;
  createSnapshot(createdAt?: string): CatalogSnapshot;
}

export interface ProjectInspector {
  inspect(input: InspectProjectInput): ProjectSnapshot;
}

export interface ResolvedPolicyProvider {
  resolve(input: ResolvePolicyInput): ResolvePolicyOutput;
}

export interface ContextSelectionProvider {
  select(input: SelectContextInput): SelectContextOutput;
}

export interface PlanEvidenceProvider {
  createPlan(input: CreatePlanInput): CreatePlanOutput;
  getEvidence(input: GetEvidenceInput): GetEvidenceOutput;
}

export interface ApplyProvider {
  apply(input: ApplyInput): ApplyOutput;
}

export type ConnectorSummary = Pick<ConnectorManifest["connector"], "id" | "name">;
