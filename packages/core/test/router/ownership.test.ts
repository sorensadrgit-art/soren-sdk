import { describe, expect, it } from "vitest";

import type { RouteRequest } from "@soren-sdk/contracts";

import {
  resolveOwnership,
  type CapabilityAssignment
} from "../../src/router/ownership.js";
import { requestFixture } from "./fixtures.js";

function requestWith(
  capabilities: RouteRequest["capabilities"]
): RouteRequest {
  return {
    ...requestFixture(),
    capabilities
  };
}

function assignment(
  capabilityId: string,
  providerId: string,
  options: Partial<CapabilityAssignment> = {}
): CapabilityAssignment {
  return {
    capabilityId,
    providerId,
    native: providerId === "web-platform",
    integrationIds: [`${providerId}-runtime`],
    support: "primary",
    confidence: 1,
    installed: false,
    preferredRank: null,
    ...options
  };
}

describe("Phase 4 ownership resolution", () => {
  it("uses capability-specific defaults without inventing cross-capability conflicts", () => {
    const result = resolveOwnership({
      request: requestWith([
        { id: "motion.presence", required: true },
        { id: "motion.timeline", required: true }
      ]),
      assignments: [
        assignment("motion.presence", "motion"),
        assignment("motion.timeline", "gsap")
      ]
    });

    expect(result.status).toBe("ok");
    expect(result.ownership).toEqual([
      {
        providerId: "gsap",
        domain: "timeline",
        scope: "capability:motion.timeline",
        properties: ["timeline"]
      },
      {
        providerId: "motion",
        domain: "presence",
        scope: "capability:motion.presence",
        properties: ["presence"]
      }
    ]);
  });

  it("allows Motion and GSAP on different explicit scopes", () => {
    const result = resolveOwnership({
      request: requestWith([
        {
          id: "motion.layout",
          required: true,
          quality: { scope: "card-grid", property: "layout" }
        },
        {
          id: "motion.timeline",
          required: true,
          quality: { scope: "hero", property: "transform" }
        }
      ]),
      assignments: [
        assignment("motion.layout", "motion"),
        assignment("motion.timeline", "gsap")
      ]
    });

    expect(result.status).toBe("ok");
    expect(result.constraints).toEqual([]);
  });

  it("blocks different providers owning the same explicit scope and property", () => {
    const result = resolveOwnership({
      request: requestWith([
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
      assignments: [
        assignment("motion.layout", "motion"),
        assignment("motion.timeline", "gsap")
      ]
    });

    expect(result.status).toBe("blocked");
    expect(result.constraints).toContainEqual(
      expect.objectContaining({ code: "OWNERSHIP_CONFLICT", status: "failed" })
    );
  });

  it("allows the same scope when explicit properties do not overlap", () => {
    const result = resolveOwnership({
      request: requestWith([
        {
          id: "motion.layout",
          required: true,
          quality: { scope: "hero", property: "layout" }
        },
        {
          id: "motion.timeline",
          required: true,
          quality: { scope: "hero", property: "opacity" }
        }
      ]),
      assignments: [
        assignment("motion.layout", "motion"),
        assignment("motion.timeline", "gsap")
      ]
    });

    expect(result.status).toBe("ok");
  });

  it("requires property input when same-scope provider templates can overlap", () => {
    const result = resolveOwnership({
      request: requestWith([
        { id: "motion.layout", required: true, quality: { scope: "hero" } },
        { id: "motion.flip", required: true, quality: { scope: "hero" } }
      ]),
      assignments: [
        assignment("motion.layout", "motion"),
        assignment("motion.flip", "gsap")
      ]
    });

    expect(result.status).toBe("needs-input");
    expect(result.constraints).toContainEqual(
      expect.objectContaining({ code: "OWNERSHIP_AMBIGUOUS", status: "failed" })
    );
    expect(result.requiredInput).toEqual([
      "Specify non-overlapping properties for scope hero."
    ]);
  });

  it("sorts ownership by provider, scope, domain, and property", () => {
    const result = resolveOwnership({
      request: requestWith([
        {
          id: "motion.timeline",
          required: true,
          quality: { scope: "z", property: "opacity" }
        },
        {
          id: "motion.layout",
          required: true,
          quality: { scope: "a", property: "layout" }
        },
        {
          id: "platform.css-transition",
          required: true,
          quality: { scope: "button", property: "color" }
        }
      ]),
      assignments: [
        assignment("motion.layout", "motion"),
        assignment("platform.css-transition", "web-platform"),
        assignment("motion.timeline", "gsap")
      ]
    });

    expect(result.ownership.map((item) => item.providerId)).toEqual([
      "gsap",
      "motion",
      "web-platform"
    ]);
  });
});
