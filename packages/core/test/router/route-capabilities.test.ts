import { describe, expect, it } from "vitest";

import type { RouteRequest } from "@soren-sdk/contracts";

import { routeCapabilities } from "../../src/index.js";
import {
  projectFixture,
  requestFixture,
  routingCatalog
} from "./fixtures.js";

function request(
  capabilities: RouteRequest["capabilities"],
  preferences: Partial<RouteRequest["preferences"]> = {}
): RouteRequest {
  const base = requestFixture();
  return {
    ...base,
    capabilities,
    preferences: {
      ...base.preferences,
      ...preferences
    }
  };
}

function reasonCodes(plan: ReturnType<typeof routeCapabilities>): string[] {
  return [
    ...plan.selectedProviders.map((provider) => provider.reasonCode),
    ...plan.rejectedProviders.map((provider) => provider.reasonCode),
    ...plan.constraints.map((constraint) => constraint.code)
  ];
}

describe("routeCapabilities", () => {
  it.each([
    "platform.css-transition",
    "platform.css-animation",
    "platform.waapi-animation"
  ])("routes %s to the native Web Platform", (capability) => {
    const plan = routeCapabilities({
      request: request([{ id: capability, required: true }]),
      project: projectFixture(),
      catalog: routingCatalog()
    });

    expect(plan.status).toBe("native");
    expect(plan.selectedProviders).toEqual([]);
    expect(reasonCodes(plan)).toContain("NATIVE_CAPABILITY_MATCH");
  });

  it("does not report the native provider as a rejected alternative", () => {
    const plan = routeCapabilities({
      request: request([{ id: "platform.css-transition", required: true }]),
      project: projectFixture(),
      catalog: routingCatalog()
    });

    expect(plan.status).toBe("native");
    expect(
      plan.rejectedProviders.map((provider) => provider.providerId)
    ).not.toContain("web-platform");
  });

  it("does not report the native provider as rejected on a mixed route", () => {
    const plan = routeCapabilities({
      request: request([
        { id: "platform.css-transition", required: true },
        { id: "motion.layout", required: true }
      ]),
      project: projectFixture({ react: "19.2.0" }),
      catalog: routingCatalog()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders.map((provider) => provider.providerId)).toEqual([
      "motion"
    ]);
    expect(
      plan.rejectedProviders.map((provider) => provider.providerId)
    ).not.toContain("web-platform");
  });

  it.each([
    "motion.presence",
    "motion.layout",
    "motion.shared-layout",
    "motion.spring",
    "interaction.drag",
    "interaction.gesture"
  ])("selects Motion for %s", (capability) => {
    const plan = routeCapabilities({
      request: request([{ id: capability, required: true }]),
      project: projectFixture({ react: "19.2.0" }),
      catalog: routingCatalog()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders.map((provider) => provider.providerId)).toEqual([
      "motion"
    ]);
  });

  it.each([
    "motion.timeline",
    "motion.svg",
    "motion.flip",
    "scroll.triggered-animation",
    "scroll.pinned-sequence"
  ])("selects GSAP for %s", (capability) => {
    const plan = routeCapabilities({
      request: request([{ id: capability, required: true }]),
      project: projectFixture(),
      catalog: routingCatalog()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders.map((provider) => provider.providerId)).toEqual([
      "gsap"
    ]);
  });

  it("selects Motion and GSAP on separate scopes", () => {
    const plan = routeCapabilities({
      request: request([
        {
          id: "motion.layout",
          required: true,
          quality: { scope: "cards", property: "layout" }
        },
        {
          id: "motion.timeline",
          required: true,
          quality: { scope: "hero", property: "transform" }
        }
      ]),
      project: projectFixture({ react: "19.2.0" }),
      catalog: routingCatalog()
    });

    expect(plan.status).toBe("selected");
    expect(plan.selectedProviders.map((provider) => provider.providerId)).toEqual([
      "gsap",
      "motion"
    ]);
  });

  it("blocks Motion and GSAP on the same explicit scope and property", () => {
    const plan = routeCapabilities({
      request: request([
        {
          id: "motion.layout",
          required: true,
          quality: { scope: "hero", property: "transform" }
        },
        {
          id: "motion.timeline",
          required: true,
          quality: { scope: "hero", property: "transform" }
        }
      ]),
      project: projectFixture({ react: "19.2.0" }),
      catalog: routingCatalog()
    });

    expect(plan.status).toBe("blocked");
    expect(reasonCodes(plan)).toContain("OWNERSHIP_CONFLICT");
  });

  it("returns needs-input for same-scope overlapping ownership without properties", () => {
    const plan = routeCapabilities({
      request: request([
        { id: "motion.layout", required: true, quality: { scope: "hero" } },
        { id: "motion.flip", required: true, quality: { scope: "hero" } }
      ]),
      project: projectFixture({ react: "19.2.0" }),
      catalog: routingCatalog()
    });

    expect(plan.status).toBe("needs-input");
    expect(plan.requiredInput).toEqual([
      "Specify non-overlapping properties for scope hero."
    ]);
  });

  it("blocks an unknown required capability", () => {
    const plan = routeCapabilities({
      request: request([{ id: "unknown.required", required: true }]),
      project: projectFixture(),
      catalog: routingCatalog()
    });

    expect(plan.status).toBe("blocked");
    expect(reasonCodes(plan)).toContain("CAPABILITY_NOT_SUPPORTED");
  });

  it("returns no-sdk when only an unknown optional capability is requested", () => {
    const plan = routeCapabilities({
      request: request([{ id: "unknown.optional", required: false }]),
      project: projectFixture(),
      catalog: routingCatalog()
    });

    expect(plan.status).toBe("no-sdk");
    expect(plan.selectedProviders).toEqual([]);
    expect(reasonCodes(plan)).toContain("OPTIONAL_CAPABILITY_OMITTED");
  });

  it("blocks when the minimum provider set exceeds maxProviders", () => {
    const plan = routeCapabilities({
      request: request(
        [
          { id: "motion.layout", required: true },
          { id: "motion.timeline", required: true }
        ],
        { maxProviders: 1 }
      ),
      project: projectFixture({ react: "19.2.0" }),
      catalog: routingCatalog()
    });

    expect(plan.status).toBe("blocked");
    expect(reasonCodes(plan)).toContain("PROVIDER_LIMIT_EXCEEDED");
  });

  it("blocks Motion React claims when React 18.2 cannot be proven", () => {
    const plan = routeCapabilities({
      request: request([{ id: "motion.presence", required: true }]),
      project: projectFixture({ react: "^17.0.0" }),
      catalog: routingCatalog()
    });

    expect(plan.status).toBe("blocked");
    expect(reasonCodes(plan)).toContain("ENVIRONMENT_UNSUPPORTED");
  });

  it("never selects a forbidden provider", () => {
    const plan = routeCapabilities({
      request: request(
        [{ id: "motion.presence", required: true }],
        { forbiddenProviders: ["motion"] }
      ),
      project: projectFixture({ react: "19.2.0" }),
      catalog: routingCatalog()
    });

    expect(plan.status).toBe("blocked");
    expect(plan.selectedProviders).toEqual([]);
    expect(reasonCodes(plan)).toContain("FORBIDDEN_PROVIDER");
  });

  it("uses dependency-reuse explanation for an installed provider", () => {
    const plan = routeCapabilities({
      request: request([{ id: "motion.layout", required: true }]),
      project: projectFixture({ react: "19.2.0", dependencies: ["motion"] }),
      catalog: routingCatalog()
    });

    expect(plan.selectedProviders[0]?.reasonCode).toBe(
      "EXISTING_DEPENDENCY_REUSE"
    );
  });

  it("produces a contract-shaped content-addressed plan", () => {
    const plan = routeCapabilities({
      request: request([{ id: "motion.timeline", required: true }]),
      project: projectFixture(),
      catalog: routingCatalog(),
      createdAt: "2026-07-31T00:00:00.000Z"
    });

    expect(plan.contractKind).toBe("route-plan");
    expect(plan.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(plan.planId).toMatch(/^route_[0-9a-f]{24}$/);
    expect(plan.catalogSnapshotId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(plan.policySnapshotId).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
