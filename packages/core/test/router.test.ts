import {
  assertContract,
  digestJson,
  type CapabilityCatalog,
  type CatalogSnapshot,
  type ConnectorManifest,
  type Digest,
  type JsonValue,
  type ProjectSnapshot,
  type RouteRequest
} from "@soren-sdk/contracts";
import { describe, expect, it } from "vitest";

import {
  PHASE_4_POLICY,
  routeCapabilities,
  type CatalogReader,
  type ConnectorHealthReport,
  type ConnectorRecord
} from "../src/index.js";
import { goldenRouteCases } from "./fixtures/route-cases.js";

const PROJECT_ID = `sha256:${"1".repeat(64)}` as Digest;

const capabilityCatalog: CapabilityCatalog = {
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

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function integration(
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

function manifest(
  providerId: "gsap" | "motion" | "web-platform",
  claims: string[]
): ConnectorManifest {
  const packageName = providerId === "web-platform" ? undefined : providerId;
  const domains = [
    ...new Set(
      claims.map(
        (claim) =>
          capabilityCatalog.capabilities.find((item) => item.id === claim)
            ?.ownershipDomain ?? claim
      )
    )
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
    integrations: [integration(providerId, packageName)],
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

const defaultRecords: ConnectorRecord[] = [
  schemaRecord(
    manifest("web-platform", [
      "platform.css-transition",
      "platform.css-animation",
      "platform.waapi-animation"
    ])
  ),
  schemaRecord(
    manifest("motion", [
      "motion.presence",
      "motion.layout",
      "motion.shared-layout",
      "motion.spring",
      "interaction.drag",
      "interaction.gesture"
    ])
  ),
  schemaRecord(
    manifest("gsap", [
      "motion.timeline",
      "motion.svg",
      "motion.flip",
      "scroll.triggered-animation",
      "scroll.pinned-sequence"
    ])
  )
];

function schemaRecord(value: ConnectorManifest): ConnectorRecord {
  return {
    kind: "schema-v2",
    directoryId: value.connector.id,
    path: `/catalog/${value.connector.id}/sdk.manifest.json`,
    manifest: value,
    selectable: value.connector.selectable
  };
}

class MemoryCatalog implements CatalogReader {
  constructor(
    private readonly records: ConnectorRecord[] = defaultRecords,
    private readonly unhealthy = new Set<string>()
  ) {}

  getCapabilityCatalog(): CapabilityCatalog {
    return capabilityCatalog;
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
    const isUnhealthy = this.unhealthy.has(connectorId);
    return {
      connectorId,
      state: isUnhealthy ? "blocked" : "healthy",
      selectable: !isUnhealthy && record.selectable,
      reviewStatus: record.manifest.connector.reviewStatus,
      blockers: isUnhealthy ? ["fixture unhealthy"] : [],
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
      capabilityCatalogDigest: digestJson(json(capabilityCatalog)),
      connectors
    };
    return {
      ...payload,
      createdAt,
      snapshotId: digestJson(json(payload))
    };
  }
}

function project(options: {
  dependencies?: string[];
  reactVersion?: string | null;
  root?: string;
  snapshotId?: Digest;
} = {}): ProjectSnapshot {
  const reactVersion = options.reactVersion === undefined ? "18.2.0" : options.reactVersion;
  const names = new Set(options.dependencies ?? []);
  if (reactVersion !== null) names.add("react");
  const dependencies = [...names]
    .sort()
    .map((name) => ({
      name,
      version:
        name === "react"
          ? (reactVersion ?? "18.2.0")
          : name === "motion"
            ? "12.42.1"
            : name === "framer-motion"
              ? "12.42.1"
              : name === "gsap"
                ? "3.15.0"
                : "1.0.0",
      kind: "dependency" as const,
      workspace: "."
    }));

  return {
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
}

function request(options: {
  required?: string[];
  optional?: string[];
  preferred?: string[];
  forbidden?: string[];
  maxProviders?: number;
  quality?: Record<string, { scope?: string; property?: string }>;
  createdAt?: string;
  projectSnapshotId?: Digest;
  requestId?: string;
}): RouteRequest {
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

function providerIds(plan: ReturnType<typeof routeCapabilities>): string[] {
  return plan.selectedProviders.map((provider) => provider.providerId).sort();
}

describe("routeCapabilities golden cases", () => {
  it.each(goldenRouteCases)("$name", (routeCase) => {
    const catalog = new MemoryCatalog(
      defaultRecords,
      new Set(routeCase.unhealthy ?? [])
    );
    const snapshot = project({
      dependencies: routeCase.dependencies,
      reactVersion: routeCase.reactVersion
    });
    const plan = routeCapabilities({
      request: request({
        required: routeCase.required,
        optional: routeCase.optional,
        preferred: routeCase.preferred,
        forbidden: routeCase.forbidden,
        maxProviders: routeCase.maxProviders,
        quality: routeCase.quality,
        projectSnapshotId: snapshot.snapshotId
      }),
      project: snapshot,
      catalog,
      policy: PHASE_4_POLICY,
      createdAt: "2026-07-30T12:30:00.000Z"
    });

    assertContract("route-plan", plan);
    expect(plan.status).toBe(routeCase.expectedStatus);
    expect(providerIds(plan)).toEqual([...routeCase.expectedProviders].sort());
    if (routeCase.expectedReasonCode !== undefined) {
      expect(plan.selectedProviders[0]?.reasonCode).toBe(
        routeCase.expectedReasonCode
      );
    }
  });
});

describe("routeCapabilities determinism", () => {
  it("does not change the digest when request capability order changes", () => {
    const snapshot = project();
    const first = routeCapabilities({
      request: request({
        required: ["motion.layout", "motion.timeline"],
        projectSnapshotId: snapshot.snapshotId
      }),
      project: snapshot,
      catalog: new MemoryCatalog(),
      createdAt: "2026-07-30T13:00:00.000Z"
    });
    const second = routeCapabilities({
      request: request({
        required: ["motion.timeline", "motion.layout"],
        projectSnapshotId: snapshot.snapshotId
      }),
      project: snapshot,
      catalog: new MemoryCatalog(),
      createdAt: "2026-07-30T13:00:00.000Z"
    });

    expect(second.digest).toBe(first.digest);
    expect(second.planId).toBe(first.planId);
  });

  it("does not change the digest when catalog enumeration order changes", () => {
    const snapshot = project();
    const routeRequest = request({
      required: ["motion.layout", "motion.timeline"],
      projectSnapshotId: snapshot.snapshotId
    });
    const first = routeCapabilities({
      request: routeRequest,
      project: snapshot,
      catalog: new MemoryCatalog(defaultRecords),
      createdAt: "2026-07-30T13:00:00.000Z"
    });
    const second = routeCapabilities({
      request: routeRequest,
      project: snapshot,
      catalog: new MemoryCatalog([...defaultRecords].reverse()),
      createdAt: "2026-07-30T13:00:00.000Z"
    });

    expect(second.digest).toBe(first.digest);
  });

  it("does not include route creation time in the digest", () => {
    const snapshot = project();
    const routeRequest = request({
      required: ["motion.timeline"],
      projectSnapshotId: snapshot.snapshotId
    });
    const first = routeCapabilities({
      request: routeRequest,
      project: snapshot,
      catalog: new MemoryCatalog(),
      createdAt: "2026-07-30T13:00:00.000Z"
    });
    const second = routeCapabilities({
      request: routeRequest,
      project: snapshot,
      catalog: new MemoryCatalog(),
      createdAt: "2027-01-01T00:00:00.000Z"
    });

    expect(second.digest).toBe(first.digest);
  });

  it("does not include project clone path in the digest", () => {
    const firstProject = project({ root: "/clone-a" });
    const secondProject = project({ root: "/clone-b" });
    const routeRequest = request({
      required: ["motion.timeline"],
      projectSnapshotId: firstProject.snapshotId
    });
    const first = routeCapabilities({
      request: routeRequest,
      project: firstProject,
      catalog: new MemoryCatalog()
    });
    const second = routeCapabilities({
      request: routeRequest,
      project: secondProject,
      catalog: new MemoryCatalog()
    });

    expect(second.digest).toBe(first.digest);
  });

  it("keeps provider choice when an unrelated dependency is added", () => {
    const base = project();
    const unrelated = project({ dependencies: ["zod"] });
    const first = routeCapabilities({
      request: request({
        required: ["motion.timeline"],
        projectSnapshotId: base.snapshotId
      }),
      project: base,
      catalog: new MemoryCatalog()
    });
    const second = routeCapabilities({
      request: request({
        required: ["motion.timeline"],
        projectSnapshotId: unrelated.snapshotId
      }),
      project: unrelated,
      catalog: new MemoryCatalog()
    });

    expect(providerIds(second)).toEqual(providerIds(first));
  });

  it("changes the explanation to dependency reuse without changing coverage", () => {
    const withoutDependency = project();
    const withDependency = project({ dependencies: ["gsap"] });
    const first = routeCapabilities({
      request: request({
        required: ["motion.timeline"],
        projectSnapshotId: withoutDependency.snapshotId
      }),
      project: withoutDependency,
      catalog: new MemoryCatalog()
    });
    const second = routeCapabilities({
      request: request({
        required: ["motion.timeline"],
        projectSnapshotId: withDependency.snapshotId
      }),
      project: withDependency,
      catalog: new MemoryCatalog()
    });

    expect(providerIds(second)).toEqual(providerIds(first));
    expect(second.selectedProviders[0]?.capabilities).toEqual(
      first.selectedProviders[0]?.capabilities
    );
    expect(first.selectedProviders[0]?.reasonCode).toBe("CAPABILITY_MATCH");
    expect(second.selectedProviders[0]?.reasonCode).toBe(
      "EXISTING_DEPENDENCY_REUSE"
    );
  });
});

describe("routeCapabilities ambiguity and validation", () => {
  it("returns needs-input for a material provider tie", () => {
    const tiedGsap = manifest("gsap", ["motion.spring"]);
    const tiedMotion = manifest("motion", ["motion.spring"]);
    const snapshot = project();
    const plan = routeCapabilities({
      request: request({
        required: ["motion.spring"],
        projectSnapshotId: snapshot.snapshotId
      }),
      project: snapshot,
      catalog: new MemoryCatalog([
        schemaRecord(tiedGsap),
        schemaRecord(tiedMotion)
      ])
    });

    expect(plan.status).toBe("needs-input");
    expect(plan.requiredInput).toContain("preferred provider");
  });

  it("uses preferred-provider order to resolve an otherwise material tie", () => {
    const tiedGsap = manifest("gsap", ["motion.spring"]);
    const tiedMotion = manifest("motion", ["motion.spring"]);
    const snapshot = project();
    const plan = routeCapabilities({
      request: request({
        required: ["motion.spring"],
        preferred: ["motion"],
        projectSnapshotId: snapshot.snapshotId
      }),
      project: snapshot,
      catalog: new MemoryCatalog([
        schemaRecord(tiedGsap),
        schemaRecord(tiedMotion)
      ])
    });

    expect(plan.status).toBe("selected");
    expect(providerIds(plan)).toEqual(["motion"]);
    expect(plan.selectedProviders[0]?.reasonCode).toBe("PREFERRED_PROVIDER");
  });

  it("rejects a request for a different project snapshot", () => {
    const snapshot = project();
    expect(() =>
      routeCapabilities({
        request: request({
          required: ["platform.css-transition"],
          projectSnapshotId: `sha256:${"9".repeat(64)}`
        }),
        project: snapshot,
        catalog: new MemoryCatalog()
      })
    ).toThrow(/project snapshot/i);
  });

  it("validates the supplied policy contract", () => {
    const snapshot = project();
    expect(() =>
      routeCapabilities({
        request: request({
          required: ["platform.css-transition"],
          projectSnapshotId: snapshot.snapshotId
        }),
        project: snapshot,
        catalog: new MemoryCatalog(),
        policy: {
          ...PHASE_4_POLICY,
          rules: { ...PHASE_4_POLICY.rules, requireReducedMotion: false }
        }
      })
    ).not.toThrow();
  });
});
