import { describe, expect, it } from "vitest";

import type { Digest } from "@soren-sdk/contracts";

import {
  buildRouteRequest,
  parseRouteOptions
} from "../src/route-options.js";

const PROJECT_SNAPSHOT_ID = `sha256:${"1".repeat(64)}` as Digest;

describe("route request construction", () => {
  it("produces the same request ID for equivalent capability ordering", () => {
    const left = buildRouteRequest(
      parseRouteOptions([
        "--capability",
        "motion.timeline",
        "--capability",
        "motion.layout",
        "--scope",
        "hero",
        "--property",
        "transform"
      ]),
      PROJECT_SNAPSHOT_ID,
      "2026-07-31T00:00:00.000Z"
    );
    const right = buildRouteRequest(
      parseRouteOptions([
        "--capability",
        "motion.layout",
        "--capability",
        "motion.timeline",
        "--property",
        "transform",
        "--scope",
        "hero"
      ]),
      PROJECT_SNAPSHOT_ID,
      "2026-07-31T01:00:00.000Z"
    );

    expect(left.requestId).toBe(right.requestId);
    expect(left.capabilities).toEqual(right.capabilities);
  });

  it("preserves preferred-provider order because it affects routing", () => {
    const motionFirst = buildRouteRequest(
      parseRouteOptions([
        "--capability",
        "motion.timeline",
        "--preferred",
        "motion",
        "--preferred",
        "gsap"
      ]),
      PROJECT_SNAPSHOT_ID,
      "2026-07-31T00:00:00.000Z"
    );
    const gsapFirst = buildRouteRequest(
      parseRouteOptions([
        "--capability",
        "motion.timeline",
        "--preferred",
        "gsap",
        "--preferred",
        "motion"
      ]),
      PROJECT_SNAPSHOT_ID,
      "2026-07-31T00:00:00.000Z"
    );

    expect(motionFirst.requestId).not.toBe(gsapFirst.requestId);
    expect(motionFirst.preferences.preferredProviders).toEqual([
      "motion",
      "gsap"
    ]);
  });
});
