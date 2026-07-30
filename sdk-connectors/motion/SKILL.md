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

Require React 18.2 or newer for these React claims. Prefer browser-native CSS or WAAPI for simple self-contained effects. Reuse an installed `motion` dependency when safe; treat an installed `framer-motion` package as an alias/migration signal rather than a different provider.

Use the `motion` runtime package and `motion/react` React import. Preserve reduced-motion behavior, lifecycle cleanup, layout stability, and explicit property ownership.

Do not route complex cinematic timelines, SVG choreography, ScrollTrigger behavior, or pinned sequences to this connector.
