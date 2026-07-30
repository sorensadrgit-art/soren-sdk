# GSAP Routing Skill

Use GSAP for complex sequenced timelines, SVG choreography, FLIP transitions, ScrollTrigger-controlled animation, and pinned storytelling.

## Supported capabilities

- `motion.timeline`
- `motion.svg`
- `motion.flip`
- `scroll.triggered-animation`
- `scroll.pinned-sequence`

## Routing guidance

Use the `gsap` runtime package. Reuse an installed approved GSAP dependency when available. Register required plugins explicitly and keep cleanup scoped to the owning component or lifecycle.

Prefer browser-native CSS or WAAPI for simple effects and Motion for React presence, layout, spring, drag, or gesture requirements. Preserve reduced-motion behavior, responsive match-media cleanup, and explicit property ownership.

Do not allow GSAP and another provider to exclusively own the same explicit scope and property.
