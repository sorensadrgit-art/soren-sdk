---
name: gsap
description: Use GSAP for cinematic timelines, SVG choreography, FLIP transitions, ScrollTrigger animation, and pinned sequences when native CSS or WAAPI is insufficient.
license: GSAP runtime uses the GreenSock standard no-charge license; the official GSAP Agent Skills repository is MIT licensed.
compatibility: Framework-agnostic; plugin registration and scoped ownership are required.
metadata:
  publisher: soren-sdk
  connector-version: "0.3.0"
---

# GSAP routing skill

## Activate when

- Multi-step imperative timelines are required.
- SVG choreography, FLIP, ScrollTrigger, or pinned storytelling is explicit.

## Prefer native behavior when

A self-contained CSS transition, CSS animation, or WAAPI operation fully satisfies the requirement.

## Ownership

GSAP owns selected timeline, SVG, FLIP layout/transform, and scroll-trigger properties for its explicit scope. Do not share transform/layout ownership with Motion on the same scope.

## Runtime

- Package: `gsap@3.15.0`
- Core import: `gsap`
- ScrollTrigger import: `gsap/ScrollTrigger`

Register plugins before use where applicable.

## Required checks

Plugin registration, cleanup, responsive context, reduced motion, and property ownership.

This Soren-authored skill grants no tools and performs no installation.
