# First SDK Wave

This document defines the first six connectors and why they are prioritized.

## 1. Motion

### Purpose

Use Motion for:

- React component animation
- Presence and exit animation
- Layout animation
- Shared-layout transitions
- Gestures
- Drag behavior
- Springs
- Component-level scroll-linked effects where appropriate

### Agent integration

Preferred:

- Official Motion AI Kit MCP
- Official Motion skills
- Official current documentation
- Motion performance audit tools where available

Important operational note:

- AI Kit access may require Motion+ and authentication.
- The connector must provide an official-docs fallback when the MCP is unavailable.

### Ownership

Motion owns selected React component properties and behaviors.

It does not own:

- Smooth-scroll transport
- WebGL rendering
- A DOM property already owned by GSAP
- General component documentation

### First benchmark

Build accessible animated tabs with:

- Direction-aware content transitions
- Keyboard behavior
- Reduced-motion fallback
- Cleanup
- No layout jump
- Storybook stories

---

## 2. GSAP

### Purpose

Use GSAP for:

- Cinematic multi-step timelines
- ScrollTrigger
- Pinned storytelling
- Advanced sequencing
- SVG choreography
- Flip transitions
- Draggable when selected instead of another gesture owner
- Framework-independent animation systems

### Agent integration

Preferred:

- Official GSAP agent skills
- Official GSAP documentation
- Soren ownership and quality rules

### Ownership

GSAP owns the selected timeline or properties.

It must not share the same property on the same element with Motion.

### First benchmark

Build a pinned three-section narrative with:

- Correct plugin registration
- Framework-safe cleanup
- Responsive behavior
- Reduced-motion alternative
- No duplicate triggers
- Reversible scroll behavior

---

## 3. Lenis

### Purpose

Use Lenis for:

- Smooth-scroll transport
- Scroll normalization
- DOM and WebGL scroll synchronization

### Agent integration

Preferred:

- Official Lenis documentation
- Soren-authored Lenis skill
- Soren runtime adapter later

### Ownership

Lenis owns scroll transport.

It does not own:

- Element animation
- Timeline sequencing
- Component presence
- WebGL object transforms

### First benchmark

Integrate Lenis into a Next.js route with:

- One initialization
- Route cleanup
- Anchor navigation
- Reduced-motion fallback
- Native fallback
- GSAP synchronization when GSAP is present

---

## 4. React Three Fiber

### Purpose

Use React Three Fiber for:

- React-managed Three.js scenes
- 3D models
- WebGL interaction
- Camera behavior
- Shader and render-loop integration
- DOM/WebGL synchronized experiences

### Agent integration

Preferred:

- Official React Three Fiber documentation
- Official pmndrs examples
- Soren-authored R3F specialist skill
- Optional Drei and postprocessing subconnectors later

### Ownership

R3F owns objects and rendering inside its canvas.

It does not own:

- Standard DOM UI
- Global smooth-scroll transport
- DOM accessibility semantics

### First benchmark

Build a lazy-loaded product model with:

- Static fallback
- Suspense
- Error handling
- Capped DPR
- Mobile quality reduction
- Reduced-motion behavior
- Resource cleanup
- No unnecessary React state updates per frame

---

## 5. Storybook

### Purpose

Use Storybook for:

- Isolated component development
- Component documentation
- Stories as agent-readable examples
- Interaction tests
- Accessibility checks
- Agent context through MCP
- Reusable design-system knowledge

### Agent integration

Preferred:

- Official Storybook MCP
- Storybook manifests
- Storybook component test feedback

Current limitation to record:

- Storybook MCP capabilities may be preview-stage and React-focused depending on the current release.

### Ownership

Storybook owns development context and component verification.

It does not own production component behavior.

### First benchmark

Expose a Button, Dialog, and animated Tabs component through:

- Descriptive stories
- Interaction tests
- Accessibility checks
- Agent-readable docs
- Successful MCP discovery

---

## 6. shadcn

### Purpose

Use shadcn for:

- Source-owned UI component distribution
- Public and private registries
- Component search and installation
- Project-aware composition
- Agent registry access

### Agent integration

Preferred:

- Official shadcn MCP
- Official shadcn skills
- Private Soren registry
- Registry fixture tests

### Ownership

shadcn owns source distribution and registry workflows.

It does not own:

- Runtime animation behavior
- Product-specific business logic
- A hidden component runtime

### First benchmark

Install a Soren registry component into a clean fixture and verify:

- Correct primitive base
- Correct dependency metadata
- Correct import aliases
- Correct tokens
- Successful type check
- Successful build
- Storybook story generation

---

## 7. First composition benchmark

Request:

> Build a cinematic product section with smooth scrolling, pinned copy, an interactive 3D product, an animated details panel, and components from the Soren registry.

Expected selection:

- Lenis — scroll transport
- GSAP — pinned section choreography
- React Three Fiber — product model
- Motion — details-panel presence and layout
- shadcn — component installation
- Storybook — documentation and testing

Expected ownership:

```text
Lenis: scroll transport
GSAP: pinned section timeline and selected DOM transforms
R3F: WebGL objects and camera
Motion: details-panel state, presence, and layout
CSS: focus, color, and simple state transitions
Storybook: development context and test feedback
shadcn: source distribution
```

The benchmark fails if:

- Motion and GSAP own the same transform
- Two scroll transports are initialized
- 3D has no fallback
- Reduced motion is ignored
- Storybook tests do not run
- Registry installation fails
- The evidence report omits unverified checks
