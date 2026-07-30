import type { RouteStatus } from "@soren-sdk/contracts";

export interface GoldenRouteCase {
  name: string;
  required?: string[];
  optional?: string[];
  preferred?: string[];
  forbidden?: string[];
  maxProviders?: number;
  dependencies?: string[];
  reactVersion?: string | null;
  unhealthy?: string[];
  quality?: Record<string, { scope?: string; property?: string }>;
  expectedStatus: RouteStatus;
  expectedProviders: string[];
  expectedReasonCode?: string;
}

export const goldenRouteCases: GoldenRouteCase[] = [
  {
    name: "simple color transition uses Web Platform",
    required: ["platform.css-transition"],
    expectedStatus: "native",
    expectedProviders: []
  },
  {
    name: "CSS keyframes use Web Platform",
    required: ["platform.css-animation"],
    expectedStatus: "native",
    expectedProviders: []
  },
  {
    name: "WAAPI imperative animation uses Web Platform",
    required: ["platform.waapi-animation"],
    expectedStatus: "native",
    expectedProviders: []
  },
  {
    name: "third-party provider forbidden does not prevent native route",
    required: ["platform.css-transition"],
    forbidden: ["motion", "gsap"],
    expectedStatus: "native",
    expectedProviders: []
  },
  {
    name: "Motion handles presence",
    required: ["motion.presence"],
    expectedStatus: "selected",
    expectedProviders: ["motion"],
    expectedReasonCode: "CAPABILITY_MATCH"
  },
  {
    name: "Motion handles layout",
    required: ["motion.layout"],
    expectedStatus: "selected",
    expectedProviders: ["motion"]
  },
  {
    name: "Motion handles shared layout",
    required: ["motion.shared-layout"],
    expectedStatus: "selected",
    expectedProviders: ["motion"]
  },
  {
    name: "Motion handles springs",
    required: ["motion.spring"],
    expectedStatus: "selected",
    expectedProviders: ["motion"]
  },
  {
    name: "Motion handles drag",
    required: ["interaction.drag"],
    expectedStatus: "selected",
    expectedProviders: ["motion"]
  },
  {
    name: "Motion handles gestures",
    required: ["interaction.gesture"],
    expectedStatus: "selected",
    expectedProviders: ["motion"]
  },
  {
    name: "existing motion dependency is reused",
    required: ["motion.layout"],
    dependencies: ["motion"],
    expectedStatus: "selected",
    expectedProviders: ["motion"],
    expectedReasonCode: "EXISTING_DEPENDENCY_REUSE"
  },
  {
    name: "framer-motion alias routes to Motion as a migration signal",
    required: ["motion.presence"],
    dependencies: ["framer-motion"],
    expectedStatus: "selected",
    expectedProviders: ["motion"],
    expectedReasonCode: "CAPABILITY_MATCH"
  },
  {
    name: "React below 18.2 blocks Motion React claims",
    required: ["motion.layout"],
    reactVersion: "17.0.2",
    expectedStatus: "blocked",
    expectedProviders: []
  },
  {
    name: "GSAP handles timeline choreography",
    required: ["motion.timeline"],
    expectedStatus: "selected",
    expectedProviders: ["gsap"]
  },
  {
    name: "GSAP handles SVG choreography",
    required: ["motion.svg"],
    expectedStatus: "selected",
    expectedProviders: ["gsap"]
  },
  {
    name: "GSAP handles FLIP",
    required: ["motion.flip"],
    expectedStatus: "selected",
    expectedProviders: ["gsap"]
  },
  {
    name: "GSAP handles triggered scroll animation",
    required: ["scroll.triggered-animation"],
    expectedStatus: "selected",
    expectedProviders: ["gsap"]
  },
  {
    name: "GSAP handles pinned sequences",
    required: ["scroll.pinned-sequence"],
    expectedStatus: "selected",
    expectedProviders: ["gsap"]
  },
  {
    name: "existing GSAP dependency is reused",
    required: ["motion.timeline"],
    dependencies: ["gsap"],
    expectedStatus: "selected",
    expectedProviders: ["gsap"],
    expectedReasonCode: "EXISTING_DEPENDENCY_REUSE"
  },
  {
    name: "Motion layout and GSAP timeline compose on separate scopes",
    required: ["motion.layout", "motion.timeline"],
    quality: {
      "motion.layout": { scope: "card-grid", property: "layout" },
      "motion.timeline": { scope: "hero", property: "transform" }
    },
    expectedStatus: "selected",
    expectedProviders: ["gsap", "motion"]
  },
  {
    name: "same scope with different properties is allowed",
    required: ["motion.layout", "motion.timeline"],
    quality: {
      "motion.layout": { scope: "hero", property: "layout" },
      "motion.timeline": { scope: "hero", property: "opacity" }
    },
    expectedStatus: "selected",
    expectedProviders: ["gsap", "motion"]
  },
  {
    name: "provider limit blocks required composition",
    required: ["motion.layout", "motion.timeline"],
    maxProviders: 1,
    expectedStatus: "blocked",
    expectedProviders: []
  },
  {
    name: "unknown required capability is blocked",
    required: ["motion.unknown"],
    expectedStatus: "blocked",
    expectedProviders: []
  },
  {
    name: "unknown optional capability needs no SDK",
    optional: ["motion.unknown"],
    expectedStatus: "no-sdk",
    expectedProviders: []
  },
  {
    name: "unknown optional capability does not disturb native route",
    required: ["platform.css-transition"],
    optional: ["motion.unknown"],
    expectedStatus: "native",
    expectedProviders: []
  },
  {
    name: "forbidden Motion candidate blocks required Motion capability",
    required: ["motion.presence"],
    forbidden: ["motion"],
    expectedStatus: "blocked",
    expectedProviders: []
  },
  {
    name: "unhealthy Motion connector is never selected",
    required: ["motion.presence"],
    unhealthy: ["motion"],
    expectedStatus: "blocked",
    expectedProviders: []
  },
  {
    name: "optional Motion capability does not force a dependency",
    optional: ["motion.presence"],
    expectedStatus: "no-sdk",
    expectedProviders: []
  },
  {
    name: "native required plus optional GSAP remains native",
    required: ["platform.css-animation"],
    optional: ["motion.timeline"],
    expectedStatus: "native",
    expectedProviders: []
  },
  {
    name: "maxProviders zero still permits native",
    required: ["platform.waapi-animation"],
    maxProviders: 0,
    expectedStatus: "native",
    expectedProviders: []
  },
  {
    name: "maxProviders zero blocks GSAP",
    required: ["motion.timeline"],
    maxProviders: 0,
    expectedStatus: "blocked",
    expectedProviders: []
  },
  {
    name: "preferred Motion remains selected for Motion capability",
    required: ["motion.spring"],
    preferred: ["motion"],
    expectedStatus: "selected",
    expectedProviders: ["motion"]
  },
  {
    name: "preferred GSAP remains selected for GSAP capability",
    required: ["motion.svg"],
    preferred: ["gsap"],
    expectedStatus: "selected",
    expectedProviders: ["gsap"]
  },
  {
    name: "explicit same-scope transform ownership conflict is blocked",
    required: ["motion.layout", "motion.timeline"],
    quality: {
      "motion.layout": { scope: "hero", property: "transform" },
      "motion.timeline": { scope: "hero", property: "transform" }
    },
    expectedStatus: "blocked",
    expectedProviders: []
  }
];
