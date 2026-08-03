---
name: motion
description: Use Motion for React presence, layout, shared-layout, spring, drag, and gesture capabilities when React 18.2 or newer is available.
license: MIT for the runtime package; optional Motion+ AI artifacts retain their own terms.
compatibility: React 18.2 or newer for the claims approved in this connector.
metadata:
  publisher: soren-sdk
  connector-version: "0.3.0"
---

# Motion routing skill

## Activate when

- React component state drives presence or layout animation.
- Shared-layout identity, spring behavior, drag, or gesture semantics are required.

## Prefer native behavior when

A self-contained CSS transition, CSS keyframe animation, or WAAPI operation fully satisfies the requirement.

## Ownership

Motion owns the selected presence, layout, gesture, timing, and DOM properties for its explicit scope. Do not share transform/layout ownership with GSAP on the same scope.

## Runtime

- Package: `motion@12.42.2`
- React import: `motion/react`
- JavaScript import: `motion`

The paid/authenticated AI Kit is optional metadata and is never required for runtime routing.

## Required checks

Reduced motion, cleanup, property ownership, and animation performance.

This Soren-authored skill grants no tools and performs no installation.
