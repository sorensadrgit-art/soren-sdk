---
name: motion
description: Use when React animation needs presence, layout projection, shared layout, springs, drag, or gestures.
license: LicenseRef-Motion-AI-Kit
compatibility: Soren SDK Phase 4; React 18.2 or newer; no executable scripts
source: ./docs.sources.json
source-digest: sha256:c2f71abd6582ca5bebff28a143cfe77d552a765570c43aa6f5a8b3b03532c4a0
---

# Motion Routing Skill

Use Motion for React-oriented state and interaction animation that requires presence, layout projection, shared layout, springs, drag, or gesture handling.

## Supported capabilities

- `motion.presence`
- `motion.layout`
- `motion.shared-layout`
- `motion.spring`
- `interaction.drag`
- `interaction.gesture`

## Routing guidance

Require a declared React range that includes React 18.2 or newer for these React claims. Prefer browser-native CSS or WAAPI for simple self-contained effects. Reuse an installed `motion` dependency only when its declared version includes the pinned runtime; treat `framer-motion` as an alias or migration signal rather than runtime reuse.

Use the `motion` runtime package and `motion/react` React import. Preserve reduced-motion behavior, lifecycle cleanup, layout stability, and explicit property ownership.

Do not route complex cinematic timelines, SVG choreography, ScrollTrigger behavior, or pinned sequences to this connector.
