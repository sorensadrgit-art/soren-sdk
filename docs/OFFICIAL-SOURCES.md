# Initial Official Sources

Last reviewed: **2026-07-27**

This file records the first authoritative sources used to design the initial connector wave.

## Motion

- Motion AI Kit context: https://motion.dev/docs/ai-kit-context
- Motion AI Kit installation: https://motion.dev/docs/ai-kit-install
- Motion AI Kit overview: https://motion.dev/docs/ai-kit
- Motion React documentation: https://motion.dev/docs/react
- Motion performance audit: https://motion.dev/docs/motionscore-code-audit

Initial finding:

Motion provides official agent-oriented documentation, skills, example context, and performance-audit tooling through its AI Kit. The connector must record authentication and paid-plan requirements and provide a documentation fallback.

## GSAP

- Official skills repository: https://github.com/greensock/gsap-skills
- Official documentation: https://gsap.com/docs/v3/

Initial finding:

GSAP supplies official Agent Skills covering core usage, timelines, ScrollTrigger, plugins, framework integrations, utilities, and performance.

## Storybook

- Storybook AI overview: https://storybook.js.org/docs/ai
- MCP overview: https://storybook.js.org/docs/ai/mcp/overview
- MCP API: https://storybook.js.org/docs/ai/mcp/api
- AI best practices: https://storybook.js.org/docs/ai/best-practices

Initial finding:

Storybook MCP can expose component documentation and testing tools to agents. Current preview and framework limitations must be recorded by the connector rather than assumed away.

## shadcn

- MCP server: https://ui.shadcn.com/docs/mcp
- Skills: https://ui.shadcn.com/docs/skills
- Registry MCP support: https://ui.shadcn.com/docs/registry/mcp
- Main documentation: https://ui.shadcn.com/docs

Initial finding:

The shadcn MCP supports browsing, searching, inspecting, and installing registry items, including compatible private registries. Official skills provide project-aware component and registry instructions.

## Lenis

- Official site and documentation: https://lenis.darkroom.engineering/
- Official repository: https://github.com/darkroomengineering/lenis

Initial finding:

The connector should treat Lenis as scroll transport and synchronization infrastructure, not as an element animation engine.

## React Three Fiber

- Official documentation: https://r3f.docs.pmnd.rs/
- Performance guidance: https://r3f.docs.pmnd.rs/advanced/scaling-performance
- Official repository: https://github.com/pmndrs/react-three-fiber

Initial finding:

The connector must encode frame-loop discipline, demand rendering, DPR control, loading, fallbacks, and resource management.

## MCP standard

- Official introduction: https://modelcontextprotocol.io/docs/getting-started/intro

Initial finding:

MCP is one connector method, not the complete Soren SDK architecture. Some SDKs will use official skills or documentation adapters instead.
