import {
  assertContract,
  type Digest,
  type RoutePlan
} from "@soren-sdk/contracts";
import { describe, expect, it } from "vitest";

import {
  PHASE_4_POLICY,
  routeCapabilities
} from "../src/index.js";
import { goldenRouteCases } from "./fixtures/route-cases.js";
import {
  MemoryCatalogFixture,
  defaultRecordsFixture,
  inputFromGoldenCase,
  manifestFixture,
  projectFixture,
  requestFixture,
  schemaRecordFixture
} from "./router-fixtures.js";

function providerIds(plan: RoutePlan): string[] {
  return plan.selectedProviders
    .map((provider) => provider.providerId)
    .sort();
}

describe("routeCapabilities golden cases", () => {
  it.each(goldenRouteCases)("$name", (routeCase) => {
    const plan = routeCapabilities(inputFromGoldenCase(routeCase));

    assertContract<RoutePlan>("route-plan", plan);
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
  it("is independent of request capability order", () => {
    const project = projectFixture();
    const forward = routeCapabilities({
      request: requestFixture({
        required: ["motion.layout", "motion.timeline"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture(),
      createdAt: "2026-07-30T13:00:00.000Z"
    });
    const reversed = routeCapabilities({
      request: requestFixture({
        required: ["motion.timeline", "motion.layout"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture(),
      createdAt: "2026-07-30T13:00:00.000Z"
    });

    expect(reversed.digest).toBe(forward.digest);
    expect(reversed.planId).toBe(forward.planId);
  });

  it("is independent of catalog enumeration order", () => {
    const project = projectFixture();
    const request = requestFixture({
      required: ["motion.layout", "motion.timeline"],
      projectSnapshotId: project.snapshotId
    });
    const forward = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture(defaultRecordsFixture),
      createdAt: "2026-07-30T13:00:00.000Z"
    });
    const reversed = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture([...defaultRecordsFixture].reverse()),
      createdAt: "2026-07-30T13:00:00.000Z"
    });

    expect(reversed.digest).toBe(forward.digest);
  });

  it("does not include creation time in route identity", () => {
    const project = projectFixture();
    const request = requestFixture({
      required: ["motion.timeline"],
      projectSnapshotId: project.snapshotId
    });
    const first = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture(),
      createdAt: "2026-07-30T13:00:00.000Z"
    });
    const later = routeCapabilities({
      request,
      project,
      catalog: new MemoryCatalogFixture(),
      createdAt: "2027-01-01T00:00:00.000Z"
    });

    expect(later.digest).toBe(first.digest);
  });

  it("does not include project clone path in route identity", () => {
    const firstProject = projectFixture({ root: "/clone-a" });
    const clonedProject = projectFixture({ root: "/clone-b" });
    const request = requestFixture({
      required: ["motion.timeline"],
      projectSnapshotId: firstProject.snapshotId
    });
    const first = routeCapabilities({
      request,
      project: firstProject,
      catalog: new MemoryCatalogFixture()
    });
    const cloned = routeCapabilities({
      request,
      project: clonedProject,
      catalog: new MemoryCatalogFixture()
    });

    expect(cloned.digest).toBe(first.digest);
  });

  it("keeps provider choice when an unrelated dependency is added", () => {
    const base = projectFixture();
    const unrelated = projectFixture({ dependencies: ["zod"] });
    const first = routeCapabilities({
      request: requestFixture({
        required: ["motion.timeline"],
        projectSnapshotId: base.snapshotId
      }),
      project: base,
      catalog: new MemoryCatalogFixture()
    });
    const second = routeCapabilities({
      request: requestFixture({
        required: ["motion.timeline"],
        projectSnapshotId: unrelated.snapshotId
      }),
      project: unrelated,
      catalog: new MemoryCatalogFixture()
    });

    expect(providerIds(second)).toEqual(providerIds(first));
  });

  it("changes only the reason when an approved dependency is installed", () => {
    const withoutDependency = projectFixture();
    const withDependency = projectFixture({ dependencies: ["gsap"] });
    const first = routeCapabilities({
      request: requestFixture({
        required: ["motion.timeline"],
        projectSnapshotId: withoutDependency.snapshotId
      }),
      project: withoutDependency,
      catalog: new MemoryCatalogFixture()
    });
    const reused = routeCapabilities({
      request: requestFixture({
        required: ["motion.timeline"],
        projectSnapshotId: withDependency.snapshotId
      }),
      project: withDependency,
      catalog: new MemoryCatalogFixture()
    });

    expect(providerIds(reused)).toEqual(providerIds(first));
    expect(reused.selectedProviders[0]?.capabilities).toEqual(
      first.selectedProviders[0]?.capabilities
    );
    expect(first.selectedProviders[0]?.reasonCode).toBe("CAPABILITY_MATCH");
    expect(reused.selectedProviders[0]?.reasonCode).toBe(
      "EXISTING_DEPENDENCY_REUSE"
    );
  });
});

describe("routeCapabilities ambiguity and validation", () => {
  it("returns needs-input for materially different tied providers", () => {
    const project = projectFixture();
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.spring"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture([
        schemaRecordFixture(manifestFixture("gsap", ["motion.spring"])),
        schemaRecordFixture(manifestFixture("motion", ["motion.spring"]))
      ])
    });

    expect(plan.status).toBe("needs-input");
    expect(plan.requiredInput).toContain("preferred provider");
  });

  it("uses preferred-provider order to resolve a material tie", () => {
    const project = projectFixture();
    const plan = routeCapabilities({
      request: requestFixture({
        required: ["motion.spring"],
        preferred: ["motion"],
        projectSnapshotId: project.snapshotId
      }),
      project,
      catalog: new MemoryCatalogFixture([
        schemaRecordFixture(manifestFixture("gsap", ["motion.spring"])),
        schemaRecordFixture(manifestFixture("motion", ["motion.spring"]))
      ])
    });

    expect(plan.status).toBe("selected");
    expect(providerIds(plan)).toEqual(["motion"]);
    expect(plan.selectedProviders[0]?.reasonCode).toBe("PREFERRED_PROVIDER");
  });

  it("rejects a request referencing a different project snapshot", () => {
    const project = projectFixture();
    expect(() =>
      routeCapabilities({
        request: requestFixture({
          required: ["platform.css-transition"],
          projectSnapshotId: `sha256:${"9".repeat(64)}` as Digest
        }),
        project,
        catalog: new MemoryCatalogFixture()
      })
    ).toThrow(/project snapshot/i);
  });

  it("accepts a contract-valid supplied run policy", () => {
    const project = projectFixture();
    expect(() =>
      routeCapabilities({
        request: requestFixture({
          required: ["platform.css-transition"],
          projectSnapshotId: project.snapshotId
        }),
        project,
        catalog: new MemoryCatalogFixture(),
        policy: {
          ...PHASE_4_POLICY,
          rules: {
            ...PHASE_4_POLICY.rules,
            requireReducedMotion: false
          }
        }
      })
    ).not.toThrow();
  });
});
