---
name: web-platform
description: Use native CSS transitions, CSS animations, or the Web Animations API when a frontend motion requirement can be satisfied without a third-party runtime.
license: Repository license policy applies; linked platform documentation retains its own terms.
compatibility: Browser projects whose declared targets support the selected native capability.
metadata:
  publisher: soren-sdk
  connector-version: "0.3.0"
---

# Web Platform routing skill

## Activate when

- A simple visual state transition can be expressed with CSS.
- Declarative keyframes are sufficient.
- Imperative animation needs only the Web Animations API.

## Do not activate when

- The request requires presence/layout semantics, gesture orchestration, cinematic timelines, ScrollTrigger, or pinned storytelling.
- Browser support cannot be established from the project snapshot.

## Ownership

Assign explicit scope and property ownership. Do not let CSS or WAAPI animate a property that Motion or GSAP owns on the same scope.

## Required checks

- Reduced-motion behavior
- Browser support
- Cleanup/cancellation
- Property ownership

This skill grants no tools, executes no code, and installs no package.
