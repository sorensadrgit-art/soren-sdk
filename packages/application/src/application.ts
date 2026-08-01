import { digestJson } from "@soren-sdk/contracts";
import { CatalogService, inspectProject } from "@soren-sdk/core";
import { FileSystemConnectorCatalog } from "@soren-sdk/connectors";

import {
  FakeContextSelectionProvider,
  FakePlanEvidenceProvider,
  FakeResolvedPolicyProvider
} from "./adapters/fakes/providers.js";
import { ProtocolError } from "./errors.js";
import type {
  CatalogProvider,
  ContextSelectionProvider,
  PlanEvidenceProvider,
  ProjectInspector,
  ResolvedPolicyProvider,
  SorenApplication
} from "./types.js";

export interface CreateSorenApplicationOptions {
  catalog: CatalogProvider;
  projectInspector: ProjectInspector;
  policyProvider?: ResolvedPolicyProvider;
  contextProvider?: ContextSelectionProvider;
  planEvidenceProvider?: PlanEvidenceProvider;
}

export function createSorenApplication(
  options: CreateSorenApplicationOptions
): SorenApplication {
  const policyProvider = options.policyProvider ?? new FakeResolvedPolicyProvider();
  const contextProvider =
    options.contextProvider ?? new FakeContextSelectionProvider();
  const planEvidenceProvider =
    options.planEvidenceProvider ?? new FakePlanEvidenceProvider();

  return {
    async catalogList() {
      return {
        connectors: options.catalog.listConnectors(),
        snapshot: options.catalog.createSnapshot()
      };
    },
    async catalogGet(input) {
      if (input.id.trim() === "") {
        throw new ProtocolError("INVALID_ARGUMENT", "Connector id is required.");
      }
      return { connector: options.catalog.getConnector(input.id) ?? null };
    },
    async connectorHealth(input) {
      if (input.id.trim() === "") {
        throw new ProtocolError("INVALID_ARGUMENT", "Connector id is required.");
      }
      return { health: options.catalog.getConnectorHealth(input.id) };
    },
    async inspectProject(input) {
      return { project: options.projectInspector.inspect(input) };
    },
    async route(input) {
      return {
        status: "unavailable",
        code: "NOT_IMPLEMENTED",
        replacementPhase: "phase-4",
        requestDigest: digestJson(input.request)
      };
    },
    async resolvePolicy(input) {
      return policyProvider.resolve(input);
    },
    async inspectLock(input) {
      return {
        status: "unavailable",
        code: "NOT_IMPLEMENTED",
        requestDigest: digestJson(input.request)
      };
    },
    async selectContext(input) {
      return contextProvider.select(input);
    },
    async createPlan(input) {
      return planEvidenceProvider.createPlan(input);
    },
    async getEvidence(input) {
      return planEvidenceProvider.getEvidence(input);
    }
  } satisfies SorenApplication;
}

export function createDefaultSorenApplication(root: string): SorenApplication {
  const catalog = new CatalogService(new FileSystemConnectorCatalog({ root }));
  return createSorenApplication({
    catalog,
    projectInspector: {
      inspect(input) {
        return input.createdAt === undefined
          ? inspectProject({ root: input.path })
          : inspectProject({
              root: input.path,
              createdAt: input.createdAt
            });
      }
    }
  });
}
