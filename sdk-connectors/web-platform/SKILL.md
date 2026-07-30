# Web Platform Routing Skill

Use this connector when the requested behavior is fully expressible with browser-native CSS transitions, CSS keyframes, or the Web Animations API.

## Supported capabilities

- `platform.css-transition`
- `platform.css-animation`
- `platform.waapi-animation`

## Routing guidance

Prefer this provider before third-party animation runtimes when it fully satisfies every required capability. It requires no dependency installation, authentication, network access, command execution, or project write permission.

Always preserve reduced-motion behavior, browser support requirements, lifecycle cleanup for WAAPI animations, and exclusive ownership of explicitly assigned DOM properties.

Do not use this connector for complex sequenced timelines, presence/layout orchestration, gestures, SVG choreography, ScrollTrigger behavior, or pinned storytelling.
