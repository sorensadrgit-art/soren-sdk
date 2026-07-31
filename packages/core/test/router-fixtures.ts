import {
  digestJson,
  type CapabilityCatalog,
  type CatalogSnapshot,
  type ConnectorManifest,
  type Digest,
  type JsonValue,
  type ProjectSnapshot,
  type RouteRequest
} from "@soren-sdk/contracts";

import { projectSnapshotDigest } from "../src/index.js";
import type {
  CatalogReader,
  ConnectorHealthReport,
  ConnectorRecord,
  RouteInput
} from "../src/index.js";
import type { GoldenRouteCase } from "./fixtures/route-cases.js";

export const PROJECT_ID = `sha256:${"1".repeat(64)}` as Digest;

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function capability(
  id: string,
  family: string,
  native: boolean,
  ownershipDomain: string
): CapabilityCatalog["capabilities"][number] {
  return {
    id,
    family,
    description: `${id} fixture`,
    native,
    ownershipDomain
  };
}

export const capabilityCatalogFixture: CapabilityCatalog = {
  schemaVersion: "1.0.0-draft.1",
  capabilities: [
    capability("platform.css-transition", "platform", true, "dom-style"),
    capability("platform.css-animation", "platform", true, "dom-animation"),
    capability("platform.waapi-animation", "platform", true, "dom-animation"),
    capability("motion.presence", "motion", false, "presence"),
    capability("motion.layout", "motion", false, "layout"),
    capability("motion.shared-layout", "motion", false, "layout"),
    capability("motion.spring", "motion", false, "timing"),
    capability("interaction.drag", "interaction", false, "gesture"),
    capability("interaction.gesture", "interaction", false, "gesture"),
    capability("motion.timeline", "motion", false, "timeline"),
    capability("motion.svg", "motion", false, "svg-animation"),
    capability("motion.flip", "motion", false, "layout"),
    capability("scroll.triggered-animation", "scroll", false, "scroll-trigger"),
    capability("scroll.pinned-sequence", "scroll", false, "scroll-trigger")
  ]
};

function runtimeIntegration(
  providerId: string,
  packageName?: string
): ConnectorManifest["integrations"][number] {
  return {
    id: `${providerId}-runtime`,
    kind: packageName === undefined ? "built-in" : "runtime-package",
    mode: "runtime",
    status: "available",
    source: `https://example.test/${providerId}`,
    version:
      packageName === undefined
        ? { status: "not-applicable" }
        : {
            status: "resolved",
            value: providerId === "motion" ? "12.42.1" : "3.15.0"
          },
    authorization: { required: false, method: "none", paidPlan: false },
    executionRisk: "none",
    dataExposure: "none",
    permissions: { filesystem: "none", network: [], projectWrite: false },
    licenseExpression:
      providerId === "gsap"
        ? "LicenseRef-GSAP-Standard"
        : packageName === undefined
          ? "not-applicable"
          : "MIT",
    fallback: null,
    ...(packageName === undefined ? {} : { packageName })
  };
}

function gsapCompanionIntegration(
  id: "gsap-flip-runtime" | "gsap-scroll-trigger-runtime",
  importPath: "gsap/Flip" | "gsap/ScrollTrigger"
): ConnectorManifest["integrations"][number] {
  return {
    ...runtimeIntegration("gsap", "gsap"),
    id,
    importPaths: { javascript: importPath }
  };
}

export function manifestFixture(
  providerId: "gsap" | "motion" | "web-platform",
  claims: string[]
): ConnectorManifest {
  const packageName = providerId === "web-platform" ? undefined : providerId;
  const domains = [
    ...new Set(
      claims.map(
        (claim) =>
          capabilityCatalogFixture.capabilities.find((item) => item.id === claim)
            ?.ownershipDomain ?? claim
      )
    )
  ];
  const integrations: ConnectorManifest["integrations"] = [
    runtimeIntegration(providerId, packageName),
    ...(providerId === "gsap"
      ? [
          gsapCompanionIntegration("gsap-flip-runtime", "gsap/Flip"),
          gsapCompanionIntegration(
            "gsap-scroll-trigger-runtime",
            "gsap/ScrollTrigger"
          )
        ]
      : [])
  ];
  return {
    schemaVersion: "2.0.0-draft.1",
    connectorVersion: "1.0.0",
    connector: {
      id: providerId,
      name: providerId,
      publisher: "soren-sdk",
      reviewStatus: "approved",
      selectable: true,
      blockers: []
    },
    product: {
      canonicalName: providerId,
      homepage: `https://example.test/${providerId}`,
      aliases: providerId === "motion" ? ["framer-motion"] : [],
      categories: ["motion"]
    },
    sourceTrust: {
      sourceAuthority: "official",
      integrityLevel: "version-pinned",
      reviewedAt: "2026-07-30",
      reviewer: "soren-sdk"
    },
    capabilityClaims: claims.map((claim) => ({
      capability: claim,
      support: "primary",
      confidence: 1,
      conditions: [],
      limitations: []
    })),
    integrations,
    ownershipClaims: domains.map((domain) => ({
      domain,
      scope: "requested-scope",
      exclusive: true,
      properties: ["layout", "opacity", "scroll", "transform"]
    })),
    verification: {
      requiredChecks: ["reduced-motion", "property-ownership"],
      hardGates: ["no-ownership-conflict"]
    },
    relatedFiles: {
      compatibility: { path: "./compatibility.json", status: "not-applicable" },
      evaluations: { path: "./evaluations", status: "not-applicable" },
      skill: { path: "./SKILL.md", status: "not-applicable" },
      sources: { path: "./docs.sources.json", status: "not-applicable" }
    },
    knowledge: { retrievedAt: "2026-07-30", staleAfterDays: 30 }
  };
}

export function schemaRecordFixture(
  manifest: ConnectorManifest
): ConnectorRecord {
  return {
    kind: "schema-v2",
    directoryId: manifest.connector.id,
    path: `/catalog/${manifest.connector.id}/sdk.manifest.json`,
    manifest,
    selectable: manifest.connector.selectable
  };
}

export const defaultRecordsFixture: ConnectorRecord[] = [
  schemaRecordFixture(
    manifestFixture("web-platform", [
      "platform.css-transition",
      "platform.css-animation",
      "platform.waapi-animation"
    ])
  ),
  schemaRecordFixture(
    manifestFixture("motion", [
      "motion.presence",
      "motion.layout",
      "motion.shared-layout",
      "motion.spring",
      "interaction.drag",
      "interaction.gesture"
    ])
  ),
  schemaRecordFixture(
    manifestFixture("gsap", [
      "motion.timeline",
      "motion.svg",
      "motion.flip",
      "scroll.triggered-animation",
      "scroll.pinned-sequence"
    ])
  )
];

export class MemoryCatalogFixture implements CatalogReader {
  constructor(
    private readonly records: ConnectorRecord[] = defaultRecordsFixture,
    private readonly unhealthy = new Set<string>()
  ) {}

  getCapabilityCatalog(): CapabilityCatalog {
    return capabilityCatalogFixture;
  }

  list(): ConnectorRecord[] {
    return [...this.records];
  }

  get(connectorId: string): ConnectorRecord | undefined {
    return this.records.find((record) =>
      record.kind === "schema-v2"
        ? record.manifest.connector.id === connectorId
        : record.directoryId === connectorId
    );
  }

  health(connectorId: string): ConnectorHealthReport {
    const record = this.get(connectorId);
    if (record === undefined || record.kind !== "schema-v2") {
      return {
        connectorId,
        state: "missing",
        selectable: false,
        reviewStatus: null,
        blockers: [],
        warnings: [],
        errors: ["missing"]
      };
    }
    const unhealthy = this.unhealthy.has(connectorId);
    return {
      connectorId,
      state: unhealthy ? "blocked" : "healthy",
      selectable: !unhealthy && record.selectable,
      reviewStatus: record.manifest.connector.reviewStatus,
      blockers: unhealthy ? ["fixture unhealthy"] : [],
      warnings: [],
      errors: []
    };
  }

  snapshot(createdAt = "2026-07-30T12:00:00.000Z"): CatalogSnapshot {
    const connectors = this.records
      .filter(
        (record): record is Extract<ConnectorRecord, { kind: "schema-v2" }> =>
          record.kind === "schema-v2"
      )
      .map((record) => ({
        id: record.manifest.connector.id,
        connectorVersion: record.manifest.connectorVersion,
        digest: digestJson(json(record.manifest)),
        reviewStatus: record.manifest.connector.reviewStatus,
        selectable: record.selectable
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
    const payload = {
      schemaVersion: "1.0.0-draft.1" as const,
      contractKind: "catalog-snapshot" as const,
      capabilityCatalogDigest: digestJson(json(capabilityCatalogFixture)),
      connectors
    };
    return {
      ...payload,
      createdAt,
      snapshotId: digestJson(json(payload))
    };
  }
}

export interface ProjectFixtureOptions {
  dependencies?: string[] | undefined;
  reactVersion?: string | null | undefined;
  root?: string | undefined;
  snapshotId?: Digest | undefined;
}

export function projectFixture(
  options: ProjectFixtureOptions = {}
): ProjectSnapshot {
  const reactVersion =
    options.reactVersion === undefined ? "18.2.0" : options.reactVersion;
  const names = new Set(options.dependencies ?? []);
  if (reactVersion !== null) names.add("react");
  const dependencies = [...names].sort().map((name) => ({
    name,
    version:
      name === "react"
        ? (reactVersion ?? "18.2.0")
        : name === "motion" || name === "framer-motion"
          ? "12.42.1"
          : name === "gsap"
            ? "3.15.0"
            : "1.0.0",
    kind: "dependency" as const,
    workspace: "."
  }));
  const snapshot: ProjectSnapshot = {
    schemaVersion: "1.0.0-draft.1",
    contractKind: "project-snapshot",
    snapshotId: options.snapshotId ?? PROJECT_ID,
    createdAt: "2026-07-30T12:00:00.000Z",
    root: options.root ?? "/project",
    revision: { vcs: "git", commit: "a".repeat(40), dirty: false },
    packageManager: {
      name: "pnpm",
      version: "11.17.0",
      lockfile: "pnpm-lock.yaml",
      lockfileDigest: `sha256:${"2".repeat(64)}`
    },
    workspace: {
      isMonorepo: false,
      packages: [{ name: "fixture", path: ".", private: true }]
    },
    runtimes: [{ name: "node", version: "24.0.0" }],
    frameworks:
      reactVersion === null
        ? []
        : [{ name: "react", version: reactVersion, workspace: "." }],
    dependencies,
    configurations: [],
    policies: [],
    targets: { browsers: ["defaults"], runtimes: ["node >=24"] },
    warnings: []
  };
  if (options.snapshotId === undefined) {
    Object.defineProperty(snapshot, "snapshotId", {
      configurable: true,
      enumerable: true,
      get: () => projectSnapshotDigest(snapshot)
    });
  }
  return snapshot;
}

export interface RequestFixtureOptions {
  required?: string[] | undefined;
  optional?: string[] | undefined;
  preferred?: string[] | undefined;
  forbidden?: string[] | undefined;
  maxProviders?: number | undefined;
  quality?: Record<string, { scope?: string; property?: string }> | undefined;
  createdAt?: string | undefined;
  projectSnapshotId?: Digest | undefined;
  requestId?: string | undefined;
}

export function requestFixture(options: RequestFixtureOptions): RouteRequest {
  const capabilities = [
    ...(options.required ?? []).map((id) => ({
      id,
      required: true,
      ...(options.quality?.[id] === undefined
        ? {}
        : { quality: options.quality[id] })
    })),
    ...(options.optional ?? []).map((id) => ({
      id,
      required: false,
      ...(options.quality?.[id] === undefined
        ? {}
        : { quality: options.quality[id] })
    }))
  ];
  return {
    schemaVersion: "1.0.0-draft.1",
    contractKind: "route-request",
    requestId: options.requestId ?? "fixture-request",
    createdAt: options.createdAt ?? "2026-07-30T12:00:00.000Z",
    projectSnapshotId: options.projectSnapshotId ?? PROJECT_ID,
    summary: "Explicit fixture request",
    capabilities,
    preferences: {
      preferredProviders: options.preferred ?? [],
      forbiddenProviders: options.forbidden ?? [],
      maxProviders: options.maxProviders ?? 3,
      allowPaidServices: false,
      allowExperimental: false
    }
  };
}

export function inputFromGoldenCase(routeCase: GoldenRouteCase): RouteInput {
  const project = projectFixture({
    dependencies: routeCase.dependencies,
    reactVersion: routeCase.reactVersion
  });
  return {
    request: requestFixture({
      required: routeCase.required,
      optional: routeCase.optional,
      preferred: routeCase.preferred,
      forbidden: routeCase.forbidden,
      maxProviders: routeCase.maxProviders,
      quality: routeCase.quality,
      projectSnapshotId: project.snapshotId
    }),
    project,
    catalog: new MemoryCatalogFixture(
      defaultRecordsFixture,
      new Set(routeCase.unhealthy ?? [])
    ),
    createdAt: "2026-07-30T12:30:00.000Z"
  };
}
