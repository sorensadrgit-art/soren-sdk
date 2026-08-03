import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { RoutePlan, RouteRequest } from "@soren-sdk/contracts";

import { routeCapabilities } from "../../src/index.js";
import {
  projectFixture,
  repositoryRoot,
  requestFixture,
  routingCatalog
} from "./fixtures.js";

interface RouteEvaluationCase {
  id: string;
  category: "native" | "motion" | "gsap" | "composition" | "negative";
  capabilities: RouteRequest["capabilities"];
  preferences?: Partial<RouteRequest["preferences"]>;
  project: {
    react?: string;
    dependencies?: string[];
  };
  expected: {
    status: RoutePlan["status"];
    selectedProviders: string[];
    reasonCodes?: string[];
  };
}

interface RouteEvaluationDocument {
  schemaVersion: "1.0.0";
  cases: RouteEvaluationCase[];
}

const document = JSON.parse(
  readFileSync(
    join(repositoryRoot(), "evaluations", "phase-4-routing.json"),
    "utf8"
  )
) as RouteEvaluationDocument;

function requestFor(testCase: RouteEvaluationCase): RouteRequest {
  const base = requestFixture();
  return {
    ...base,
    requestId: `evaluation_${testCase.id.replace(/[^A-Za-z0-9_-]/g, "_")}`,
    summary: `Phase 4 evaluation ${testCase.id}`,
    capabilities: testCase.capabilities,
    preferences: {
      ...base.preferences,
      ...testCase.preferences
    }
  };
}

function reasonCodes(plan: RoutePlan): string[] {
  return [
    ...plan.selectedProviders.map((provider) => provider.reasonCode),
    ...plan.rejectedProviders.map((provider) => provider.reasonCode),
    ...plan.constraints.map((constraint) => constraint.code)
  ];
}

describe("Phase 4 golden routing evaluations", () => {
  it("contains at least 36 cases with the required category distribution", () => {
    expect(document.schemaVersion).toBe("1.0.0");
    expect(document.cases.length).toBeGreaterThanOrEqual(36);
    const counts = Object.fromEntries(
      ["native", "motion", "gsap", "composition", "negative"].map(
        (category) => [
          category,
          document.cases.filter((testCase) => testCase.category === category)
            .length
        ]
      )
    );
    expect(counts).toMatchObject({
      native: 6,
      motion: 8,
      gsap: 7,
      composition: 7,
      negative: 8
    });
  });

  for (const testCase of document.cases) {
    it(`${testCase.category}: ${testCase.id}`, () => {
      const plan = routeCapabilities({
        request: requestFor(testCase),
        project: projectFixture({
          ...(testCase.project.react === undefined
            ? {}
            : { react: testCase.project.react }),
          dependencies: testCase.project.dependencies ?? []
        }),
        catalog: routingCatalog(),
        createdAt: "2026-07-31T00:00:00.000Z"
      });

      expect(plan.status).toBe(testCase.expected.status);
      expect(
        plan.selectedProviders.map((provider) => provider.providerId).sort()
      ).toEqual([...testCase.expected.selectedProviders].sort());
      for (const reasonCode of testCase.expected.reasonCodes ?? []) {
        expect(reasonCodes(plan)).toContain(reasonCode);
      }
    });
  }
});
