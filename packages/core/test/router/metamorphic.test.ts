import { describe, expect, it } from "vitest";

import type {
  CatalogSnapshot,
  RouteRequest
} from "@soren-sdk/contracts";
import type { ConnectorRecord } from "../../src/catalog/types.js";
import { routeCapabilities } from "../../src/index.js";
import {
  projectFixture,
  requestFixture,
  routingCatalog
} from "./fixtures.js";

function request(capabilities: RouteRequest["capabilities"]): RouteRequest {
  return {
    ...requestFixture(),
    capabilities
  };
}

function reversedCatalog() {
  const base = routingCatalog();
  return {
    ...base,
    list: (): ConnectorRecord[] => [...base.list()].reverse(),
    snapshot: (createdAt?: string): CatalogSnapshot => base.snapshot(createdAt)
  };
}

describe("routeCapabilities metamorphic behavior", () => {
  it("ignores requested capability order", () => {
    const left = routeCapabilities({
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
    const right = routeCapabilities({
      request: request([
        {
          id: "motion.timeline",
          required: true,
          quality: { property: "transform", scope: "hero" }
        },
        {
          id: "motion.layout",
          required: true,
          quality: { property: "layout", scope: "cards" }
        }
      ]),
      project: projectFixture({ react: "19.2.0" }),
      catalog: routingCatalog()
    });

    expect(left.digest).toBe(right.digest);
    expect(left.planId).toBe(right.planId);
    expect(left.selectedProviders).toEqual(right.selectedProviders);
  });

  it("ignores catalog enumeration order", () => {
    const input = {
      request: request([{ id: "motion.timeline", required: true }]),
      project: projectFixture()
    };
    const left = routeCapabilities({ ...input, catalog: routingCatalog() });
    const right = routeCapabilities({ ...input, catalog: reversedCatalog() });
    expect(left.digest).toBe(right.digest);
  });

  it("excludes createdAt from the decision digest", () => {
    const input = {
      request: request([{ id: "motion.timeline", required: true }]),
      project: projectFixture(),
      catalog: routingCatalog()
    };
    const left = routeCapabilities({
      ...input,
      createdAt: "2026-07-30T00:00:00.000Z"
    });
    const right = routeCapabilities({
      ...input,
      createdAt: "2026-07-31T00:00:00.000Z"
    });
    expect(left.digest).toBe(right.digest);
    expect(left.planId).toBe(right.planId);
  });

  it("ignores project clone path when the snapshot ID is unchanged", () => {
    const input = {
      request: request([{ id: "motion.timeline", required: true }]),
      catalog: routingCatalog()
    };
    const left = routeCapabilities({
      ...input,
      project: projectFixture({ root: "/tmp/clone-a" })
    });
    const right = routeCapabilities({
      ...input,
      project: projectFixture({ root: "/tmp/clone-b" })
    });
    expect(left.digest).toBe(right.digest);
  });

  it("ignores unrelated dependencies for provider choice and digest", () => {
    const input = {
      request: request([{ id: "motion.timeline", required: true }]),
      catalog: routingCatalog()
    };
    const left = routeCapabilities({
      ...input,
      project: projectFixture()
    });
    const right = routeCapabilities({
      ...input,
      project: projectFixture({ dependencies: ["unrelated-package"] })
    });
    expect(left.digest).toBe(right.digest);
    expect(left.selectedProviders).toEqual(right.selectedProviders);
  });

  it("changes explanation to dependency reuse without changing coverage", () => {
    const input = {
      request: request([{ id: "motion.layout", required: true }]),
      catalog: routingCatalog()
    };
    const absent = routeCapabilities({
      ...input,
      project: projectFixture({ react: "19.2.0" })
    });
    const installed = routeCapabilities({
      ...input,
      project: projectFixture({
        react: "19.2.0",
        dependencies: ["motion"]
      })
    });

    expect(absent.selectedProviders[0]?.capabilities).toEqual(
      installed.selectedProviders[0]?.capabilities
    );
    expect(absent.selectedProviders[0]?.providerId).toBe("motion");
    expect(installed.selectedProviders[0]?.providerId).toBe("motion");
    expect(absent.selectedProviders[0]?.reasonCode).toBe("CAPABILITY_MATCH");
    expect(installed.selectedProviders[0]?.reasonCode).toBe(
      "EXISTING_DEPENDENCY_REUSE"
    );
    expect(absent.digest).not.toBe(installed.digest);
  });
});
