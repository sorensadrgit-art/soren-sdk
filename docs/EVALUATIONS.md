# Evaluations and Quality System

## 1. Why evaluations are required

A connector should prove that it improves agent behavior.

Without evaluations, a connector may:

- Add context without improving quality
- Encourage overuse of its SDK
- Teach outdated APIs
- Hide conflicts
- Increase dependency count
- Produce visually weak output
- Pass code review while failing at runtime

Soren SDK therefore evaluates both routing and implementation.

---

## 2. Evaluation categories

### 2.1 Routing evaluations

Test whether the correct SDK set is selected.

Each case contains:

```json
{
  "request": "...",
  "projectFixture": "...",
  "expectedCapabilities": [],
  "requiredConnectors": [],
  "allowedConnectors": [],
  "forbiddenConnectors": [],
  "expectedOwnership": []
}
```

### 2.2 Negative routing evaluations

Test when an SDK must not be selected.

Examples:

- Simple hover color should not select Motion or GSAP
- Native scrolling requirement should not select Lenis
- Static marketing page should not select React Three Fiber
- Existing Motion implementation should not automatically add GSAP
- Component documentation task should not install production animation packages

### 2.3 Implementation evaluations

Agent receives:

- A fixture repository
- A task
- Selected connector context
- A test suite

The output is scored by:

- Build
- Type safety
- Runtime behavior
- Accessibility
- Performance
- Cleanup
- Visual acceptance
- Dependency discipline

### 2.4 Composition evaluations

Test two or more SDKs together.

Key target:

- Correct ownership
- Correct synchronization
- No duplicate initialization
- No lifecycle leaks
- Correct fallback behavior

---

## 3. Score model

Suggested score:

| Category | Weight |
|---|---:|
| Functional correctness | 25 |
| SDK appropriateness | 15 |
| Ownership and compatibility | 15 |
| Accessibility | 10 |
| Reduced-motion behavior | 10 |
| Performance | 10 |
| Cleanup and lifecycle | 5 |
| Dependency discipline | 5 |
| Documentation and evidence | 5 |

Total: 100

A connector should not be approved based only on average score.

Hard failures include:

- Build failure
- Known ownership conflict
- Missing required accessibility behavior
- Missing required cleanup
- Exposed secret
- Unsupported API
- Falsified verification result

---

## 4. Baseline comparison

For each connector, compare:

1. Agent without connector
2. Agent with generic documentation
3. Agent with full Soren connector

Measure:

- Number of correction cycles
- Deprecated API usage
- Test pass rate
- Human review score
- Context size
- Dependency count
- Completion time
- Evidence quality

This proves whether Soren SDK adds value.

---

## 5. First routing cases

### Case A — Micro-interaction

Request:

> Add a subtle press response and focus transition to a button.

Expected:

- CSS or existing component motion
- No GSAP
- No Lenis
- No R3F

### Case B — React layout transition

Request:

> Animate cards smoothly when filters change their order.

Expected:

- Motion
- No GSAP unless an existing approved architecture requires it

### Case C — Pinned cinematic story

Request:

> Pin the product while five feature chapters animate as the page scrolls.

Expected:

- GSAP and ScrollTrigger
- Lenis only if smooth transport is requested or already approved

### Case D — Smooth transport only

Request:

> Add refined smooth scrolling without changing the section animations.

Expected:

- Lenis
- Existing animation engine preserved

### Case E — 3D product scene

Request:

> Add an interactive GLTF product model with mobile degradation and a static fallback.

Expected:

- React Three Fiber
- Optional Drei based on requirements

### Case F — Component intelligence

Request:

> Reuse the design system's Dialog correctly and add a tested story.

Expected:

- Storybook MCP
- shadcn registry when source installation is required
- No unnecessary animation runtime

---

## 6. Connector-specific required evaluations

### Motion

- Presence
- Layout
- Drag
- Reduced motion
- Cleanup
- Conflict with GSAP

### GSAP

- Timeline
- ScrollTrigger
- Responsive context
- Cleanup
- Reversible scroll
- Conflict with Motion

### Lenis

- Single instance
- Native fallback
- Route cleanup
- Anchor behavior
- GSAP synchronization

### React Three Fiber

- Lazy load
- Fallback
- DPR
- Mobile quality
- Resource cleanup
- Frame-loop discipline

### Storybook

- Story discovery
- Agent context
- Interaction test
- Accessibility test
- Failure feedback loop

### shadcn

- Registry search
- Item inspection
- Installation
- Dependency resolution
- Private registry support
- Fixture build

---

## 7. Visual review

Automated checks do not establish premium visual quality.

A human review should score:

- Composition
- Timing
- Rhythm
- Hierarchy
- Motion intent
- Responsiveness
- Perceived smoothness
- Consistency with Soren visual direction
- Reduced-motion quality
- Absence of generic repetitive animation

Visual review results should be stored separately from objective test results.

---

## 8. Evaluation artifact

Each run should produce:

```text
evaluations/results/<date>/<run-id>/
├── request.json
├── route.json
├── evidence.json
├── report.md
├── test-results/
├── screenshots/
└── performance/
```

Do not store secrets, private prompts, or unnecessary user data.
