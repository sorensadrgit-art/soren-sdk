---
name: web-platform
description: Use when browser-native CSS or Web Animations API capabilities fully satisfy the requested behavior.
license: LicenseRef-Soren-SDK-Internal
compatibility: Soren SDK Phase 4; browser-native runtime; no executable scripts
source: ./docs.sources.json
source-digest: sha256:8a1f03a2689222031b57186f7172ccae7697037462f688c6576f3a50241016d7
---

# Web Platform Routing Skill

Use this connector when the requested behavior is fully expressible with browser-native CSS transitions, CSS keyframes, or the Web Animations API.

## Supported capabilities

- `platform.css-transition`
- `platform.css-animation`
- `platform.waapi-animation`

## Routing guidance

Prefer this provider before third-party animation runtimes when it fully satisfies every required capability. It requires no dependency installation, authentication, network access, command execution, or project write permission.

Always preserve reduced-motion behavior, browser support requirements, lifecycle cleanup for WAAPI animations, and exclusive ownership of explicitly assigned DOM properties. Do not approve WAAPI when inspected browser targets include an unsupported browser such as Internet Explorer 11.

Do not use this connector for complex sequenced timelines, presence/layout orchestration, gestures, SVG choreography, ScrollTrigger behavior, or pinned storytelling.
