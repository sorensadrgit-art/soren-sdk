import type {
  CatalogGetOutput,
  CatalogListOutput,
  ConnectorHealthOutput,
  CreatePlanOutput,
  GetEvidenceOutput,
  InspectLockOutput,
  InspectProjectOutput,
  JsonValue,
  ResolvePolicyOutput,
  RouteUseCaseOutput,
  SelectContextOutput,
  SorenApplication
} from "@soren-sdk/application";

export interface SorenClient {
  catalog: {
    list(): Promise<CatalogListOutput>;
    get(id: string): Promise<CatalogGetOutput>;
  };
  connectors: {
    health(id: string): Promise<ConnectorHealthOutput>;
  };
  projects: {
    inspect(path: string): Promise<InspectProjectOutput>;
  };
  routes: {
    create(request: JsonValue): Promise<RouteUseCaseOutput>;
  };
  policy: {
    resolve(request: JsonValue): Promise<ResolvePolicyOutput>;
  };
  locks: {
    inspect(request: JsonValue): Promise<InspectLockOutput>;
  };
  context: {
    select(request: JsonValue): Promise<SelectContextOutput>;
  };
  plans: {
    create(request: JsonValue): Promise<CreatePlanOutput>;
  };
  evidence: {
    get(request: JsonValue): Promise<GetEvidenceOutput>;
  };
}

export type SorenClientOptions =
  | {
      transport: "in-process";
      application: SorenApplication;
    }
  | {
      transport: "http";
      baseUrl: string;
      fetch?: typeof fetch;
      correlationId?: string;
    };
