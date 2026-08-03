import { describe, expect, it } from "vitest";

import type { CapabilityAssignment } from "../../src/router/ownership.js";
import {
  compareRouteCandidates,
  isMaterialArchitecturalTie,
  rankRouteCandidate
} from "../../src/router/rank.js";

function assignment(
  capabilityId: string,
  providerId: string,
  options: Partial<CapabilityAssignment> = {}
): CapabilityAssignment {
  return {
    capabilityId,
    providerId,
    native: providerId === "web-platform",
    integrationIds: providerId === "web-platform" ? [] : [`${providerId}-runtime`],
    support: "primary",
    confidence: 1,
    installed: false,
    preferredRank: null,
    ...options
  };
}

function ranked(
  assignments: CapabilityAssignment[],
  selectedProviderIds: string[] = []
) {
  return rankRouteCandidate({ assignments, selectedProviderIds });
}

describe("Phase 4 route ranking", () => {
  it("prefers fewer selected third-party providers", () => {
    const one = ranked(
      [assignment("motion.layout", "motion")],
      ["motion"]
    );
    const two = ranked(
      [
        assignment("motion.layout", "motion"),
        assignment("motion.timeline", "gsap")
      ],
      ["motion", "gsap"]
    );
    expect(compareRouteCandidates(one, two)).toBeLessThan(0);
  });

  it("prefers greater native coverage after provider count", () => {
    const native = ranked([
      assignment("platform.css-transition", "web-platform")
    ]);
    const nonNative = ranked([
      assignment("platform.css-transition", "motion", { native: false })
    ]);
    expect(compareRouteCandidates(native, nonNative)).toBeLessThan(0);
  });

  it("prefers an already installed selected provider", () => {
    const installed = ranked(
      [assignment("motion.layout", "motion", { installed: true })],
      ["motion"]
    );
    const absent = ranked(
      [assignment("motion.layout", "motion", { installed: false })],
      ["motion"]
    );
    expect(compareRouteCandidates(installed, absent)).toBeLessThan(0);
  });

  it("honors preferred-provider order after dependency reuse", () => {
    const first = ranked(
      [assignment("motion.layout", "motion", { preferredRank: 0 })],
      ["motion"]
    );
    const second = ranked(
      [assignment("motion.layout", "gsap", { preferredRank: 1 })],
      ["gsap"]
    );
    expect(compareRouteCandidates(first, second)).toBeLessThan(0);
  });

  it("prefers primary support over secondary and fallback", () => {
    const primary = ranked([
      assignment("motion.layout", "motion", { support: "primary" })
    ], ["motion"]);
    const secondary = ranked([
      assignment("motion.layout", "motion", { support: "secondary" })
    ], ["motion"]);
    const fallback = ranked([
      assignment("motion.layout", "motion", { support: "fallback" })
    ], ["motion"]);
    expect(compareRouteCandidates(primary, secondary)).toBeLessThan(0);
    expect(compareRouteCandidates(secondary, fallback)).toBeLessThan(0);
  });

  it("prefers higher total confidence after stronger criteria tie", () => {
    const high = ranked([
      assignment("motion.layout", "motion", { confidence: 0.95 })
    ], ["motion"]);
    const low = ranked([
      assignment("motion.layout", "motion", { confidence: 0.8 })
    ], ["motion"]);
    expect(compareRouteCandidates(high, low)).toBeLessThan(0);
  });

  it("is independent of provider and assignment enumeration order", () => {
    const left = ranked(
      [
        assignment("motion.timeline", "gsap"),
        assignment("motion.layout", "motion")
      ],
      ["motion", "gsap"]
    );
    const right = ranked(
      [
        assignment("motion.layout", "motion"),
        assignment("motion.timeline", "gsap")
      ],
      ["gsap", "motion"]
    );
    expect(compareRouteCandidates(left, right)).toBe(0);
    expect(left).toEqual(right);
  });

  it("marks equal-score, different-provider routes as a material tie", () => {
    const motion = ranked(
      [assignment("motion.layout", "motion")],
      ["motion"]
    );
    const gsap = ranked(
      [assignment("motion.layout", "gsap")],
      ["gsap"]
    );
    expect(compareRouteCandidates(motion, gsap)).toBe(0);
    expect(isMaterialArchitecturalTie(motion, gsap)).toBe(true);
  });

  it("does not mark reordered equivalent routes as material ties", () => {
    const left = ranked(
      [
        assignment("motion.timeline", "gsap"),
        assignment("motion.layout", "motion")
      ],
      ["motion", "gsap"]
    );
    const right = ranked(
      [
        assignment("motion.layout", "motion"),
        assignment("motion.timeline", "gsap")
      ],
      ["gsap", "motion"]
    );
    expect(isMaterialArchitecturalTie(left, right)).toBe(false);
  });
});
