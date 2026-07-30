---
name: gsap
description: Use when complex timelines, SVG choreography, FLIP, ScrollTrigger, or pinned storytelling require GSAP.
license: MIT
compatibility: Soren SDK Phase 4; JavaScript framework runtimes; no executable scripts
metadata:
  publisher: soren-sdk
  version: 1.0.0
source: ./docs.sources.json
source-digest: sha256:0cb05d30bb647ff15b646a32bab5963f28cb0b5f67b4a56d8385f2bc7ef89dec
---

# GSAP Routing Skill

Use GSAP for complex sequenced timelines, SVG choreography, FLIP transitions, ScrollTrigger-controlled animation, and pinned storytelling.

## Supported capabilities

- `motion.timeline`
- `motion.svg`
- `motion.flip`
- `scroll.triggered-animation`
- `scroll.pinned-sequence`

## Routing guidance

Use the `gsap` runtime package. Reuse an installed approved GSAP dependency when its declared version includes the pinned runtime. Register required plugins explicitly and keep cleanup scoped to the owning component or lifecycle.

Prefer browser-native CSS or WAAPI for simple effects and Motion for React presence, layout, spring, drag, or gesture requirements. Preserve reduced-motion behavior, responsive match-media cleanup, and explicit property ownership.

Do not allow GSAP and another provider to exclusively own the same explicit scope and property.
