# Soren SDK — Complete Project Blueprint

## 1. Product definition

Soren SDK is an agent-native SDK intelligence and orchestration platform for creative frontend development.

Its job is to make coding agents reliably better at using modern SDKs.

It does this by combining:

- A catalog of supported SDKs
- Capability-based routing
- Current official documentation
- Official and custom agent skills
- MCP servers
- Runtime installation planning
- Compatibility and ownership rules
- Reusable recipes
- SDK-specific validators
- Evaluation benchmarks
- Evidence-based completion reports

Soren SDK does not replace Motion, GSAP, Lenis, Three.js, Storybook, shadcn, or any other SDK. It teaches agents how to select and use those systems correctly.

---

## 2. Primary users

### 2.1 Soren

Soren acts as:

- Product owner
- Creative director
- Motion systems architect
- SDK curator
- Final quality authority

The platform should allow Soren to:

- Add a new SDK connector
- Approve trusted documentation
- Define preferred ownership rules
- Store premium recipes
- Run SDK health checks
- Compare agent quality before and after a connector
- View which SDKs an agent selected
- See why the agent made that selection
- Control which agents can access each connector

### 2.2 Coding agents

Initial agents may include:

- Hermes
- OpenClaw
- OpenCode
- Codex
- Claude Code
- GitHub Copilot

Agents should receive the same normalized connector knowledge even when their native skill and MCP formats differ.

### 2.3 Future collaborators

Developers and designers should be able to understand routing decisions without reading agent prompts or internal traces.

---

## 3. Product goals

### Goal A — Better SDK selection

Select the right SDK based on requested behavior, project stack, existing dependencies, performance needs, licensing, and compatibility.

### Goal B — Better implementation quality

Ground agents in current official APIs, approved examples, cleanup rules, accessibility standards, and performance practices.

### Goal C — Better SDK composition

Safely combine SDKs while preventing overlapping ownership.

### Goal D — Lower context noise

Load only knowledge relevant to the current task.

### Goal E — Evidence-based confidence

Verify output through tests and SDK-specific audits rather than judging only by plausible code.

### Goal F — Reusable intelligence

Make the same connector usable by several agents and several projects.

### Goal G — Controlled growth

Allow new SDKs to be added without turning the system into an ungoverned collection of copied documentation and random prompts.

---

## 4. Non-goals

Soren SDK is not:

- A universal package manager
- A replacement for npm or pnpm
- A replacement for official documentation
- A global installation of every supported runtime
- A single generic prompt containing all libraries
- A reason to combine multiple SDKs unnecessarily
- An autonomous publisher with unrestricted credentials
- A replacement for human visual judgment
- A new frontend framework
- A fork of every integrated SDK
- A guarantee that automated accessibility testing proves full compliance

---

## 5. Core concepts

### 5.1 Capability

A capability is a behavior the project needs, independent of any SDK.

Examples:

- `ui.presence-animation`
- `ui.layout-animation`
- `interaction.drag`
- `timeline.cinematic`
- `scroll.smooth-transport`
- `scroll.pinned-sequence`
- `webgl.react-scene`
- `component.registry-install`
- `component.agent-context`
- `testing.story-interaction`
- `animation.performance-audit`

### 5.2 Connector

A connector is the complete intelligence package for one SDK.

It contains:

- Metadata
- Sources
- Skills
- MCP configuration
- Recipes
- Compatibility rules
- Validators
- Tests
- Migration notes

### 5.3 Runtime adapter

A runtime adapter contains project code or installation behavior needed to use an SDK consistently.

A connector may exist even when its runtime is not installed.

### 5.4 Ownership

Ownership identifies which engine controls a behavior or property.

Ownership may be assigned at several levels:

- Project
- Route
- Section
- Component
- Element
- Property

### 5.5 Trust level

Every knowledge source and connector has a trust classification.

Suggested levels:

- `official`
- `soren-approved`
- `community-reviewed`
- `experimental`
- `blocked`

### 5.6 Evidence

Evidence is the structured result proving what was selected, changed, and verified.

---

## 6. Capability taxonomy

The first taxonomy should support the following groups.

### UI structure

- Accessible primitive
- Overlay
- Form behavior
- Navigation
- Data display
- Responsive layout
- Floating positioning
- Virtualization
- Rich text
- Command interface

### Motion

- CSS transition
- Presence
- Layout transition
- Shared layout
- Drag
- Gesture
- Spring
- Timeline
- Split text
- SVG drawing
- Scroll trigger
- Route transition
- Image sequence
- Motion performance audit

### Scroll

- Native scrolling
- Smooth transport
- Scroll normalization
- Scroll progress
- Pinned storytelling
- DOM/WebGL synchronization

### Spatial and graphics

- WebGL scene
- 3D model
- Shader effect
- GPU 2D rendering
- Postprocessing
- Vector animation
- State-machine animation
- Data visualization
- Map visualization

### Developer system

- Component registry
- Component documentation
- Story generation
- Browser testing
- Accessibility testing
- Visual regression
- Build diagnostics
- Package validation

### Data and state

- Server state
- Form state
- Schema validation
- Local state
- URL state
- Table behavior

The taxonomy must remain capability-first. SDK names are implementations, not capability names.

---

## 7. Connector connection hierarchy

Use the strongest available integration method.

### Level 1 — Official MCP

Advantages:

- Structured tools and resources
- Current data
- Searchable documentation
- Executable operations
- Better agent feedback loops

Requirements:

- Confirm the server is official
- Record authentication requirements
- Record data sent externally
- Record local and remote capabilities
- Pin or record version
- Define fallback when unavailable

### Level 2 — Official agent skill

Advantages:

- Maintainer-authored usage guidance
- Agent-specific workflows
- Lower implementation effort
- Better current API knowledge

Requirements:

- Record source repository
- Pin commit or release
- Review changes before updating
- Do not silently overwrite Soren rules
- Declare which agent formats are supported

### Level 3 — Official documentation adapter

Used when no official MCP or skill exists.

Requirements:

- Official domains only by default
- Version-aware retrieval
- Source freshness date
- API deprecation tracking
- Bounded context retrieval
- No wholesale copyrighted documentation copying
- Search index must preserve source URLs

### Level 4 — Soren specialist skill

Used when the SDK needs operational judgment not supplied by an official skill.

Examples:

- Lenis ownership rules
- React Three Fiber frame-loop rules
- 3D fallback policy
- Soren motion quality standards

### Level 5 — Runtime adapter

Used when the project benefits from standardized integration code.

Examples:

- Lenis provider
- GSAP context wrapper
- Motion reduced-motion provider
- React Three Fiber scene shell
- Storybook configuration
- shadcn registry configuration

---

## 8. Routing process

### Step 1 — Inspect the project

Detect:

- Framework
- Package manager
- React version
- Build system
- Existing SDKs
- Existing component system
- Existing animation ownership
- Browser targets
- SSR boundaries
- Testing tools
- Accessibility conventions
- Registry configuration
- Package boundaries

### Step 2 — Parse the request

Convert ordinary language into capabilities.

Example:

> Make the hero lock while the product spins, reveal the copy word by word, and let users drag the feature cards.

Possible decomposition:

```text
scroll.pinned-sequence
webgl.model-animation
motion.split-text
interaction.drag
ui.layout-animation
```

### Step 3 — Retrieve candidates

Find connectors that satisfy each capability.

### Step 4 — Score candidates

Suggested scoring dimensions:

- Capability match
- Existing dependency reuse
- Framework compatibility
- SSR compatibility
- Accessibility support
- Performance suitability
- Documentation quality
- Agent integration quality
- License compatibility
- Bundle impact
- Team preference
- Soren approval status
- Conflict risk

### Step 5 — Minimize the set

Prefer the fewest SDKs that satisfy the capabilities without weakening quality.

### Step 6 — Resolve ownership

Produce a behavior and property ownership plan.

### Step 7 — Explain the result

The router must produce a human-readable explanation, not only a numeric score.

### Step 8 — Load context

Load only selected connectors and only the sections relevant to the capabilities.

---

## 9. Router decision model

A first implementation may use deterministic weighted rules rather than a language model.

Conceptual score:

```text
score =
  capability_match
+ existing_dependency_bonus
+ official_agent_integration_bonus
+ approved_recipe_bonus
+ project_stack_bonus
- conflict_penalty
- bundle_penalty
- license_penalty
- unsupported_environment_penalty
```

Hard constraints must run before scoring.

Examples of hard constraints:

- Browser-only SDK required in a server-only package
- License not allowed by project policy
- SDK blocked by the workspace
- Unsupported framework version
- Known security issue
- Ownership conflict that has no approved adapter

The language model may help interpret the user request, but it should not bypass hard rules.

---

## 10. Compatibility engine

The compatibility engine evaluates combinations.

### Relationship types

- `compatible`
- `compatible-with-ownership`
- `requires-adapter`
- `discouraged`
- `conflicting`
- `unknown`

### Example rules

```text
Motion + Lenis
Status: compatible
Condition: Motion owns elements; Lenis owns scroll transport.

GSAP + Lenis
Status: compatible-with-ownership
Condition: Use one synchronization strategy and one scroll transport.

Motion + GSAP
Status: compatible-with-ownership
Condition: Different elements or different properties must be owned.

Two smooth-scroll libraries
Status: conflicting

R3F + DOM animation
Status: compatible
Condition: DOM and canvas ownership remain separate.

Storybook + any component runtime
Status: compatible
Condition: Storybook remains a development and documentation layer.
```

### Conflict output

A conflict report should include:

- SDKs involved
- Element or scope
- Property or behavior
- Why conflict occurs
- Severity
- Recommended resolution
- Whether an approved adapter exists

---

## 11. Context builder

The context builder prevents prompt overload.

It selects:

- Connector overview
- Relevant capability rules
- Correct import path
- One or more approved recipes
- Known gotchas
- Required cleanup
- Compatibility constraints
- Required tests
- Relevant official documentation links

It should not load:

- Entire documentation sites
- Unrelated recipes
- Every supported SDK
- Old version instructions
- Duplicate generic coding advice

Suggested context budget priority:

1. Hard constraints
2. Current API information
3. Ownership and compatibility
4. Project-specific conventions
5. Approved recipe
6. Verification checklist
7. Optional background explanation

---

## 12. Project inspector

The project inspector should eventually produce a normalized report:

```json
{
  "framework": "nextjs",
  "frameworkVersion": "detected version",
  "reactVersion": "detected version",
  "packageManager": "pnpm",
  "workspace": true,
  "animationDependencies": [],
  "scrollDependencies": [],
  "threeDependencies": [],
  "componentSystem": [],
  "storybook": {
    "installed": false
  },
  "testing": [],
  "ssr": true,
  "paths": {
    "root": ".",
    "app": "apps/web"
  }
}
```

It must inspect actual files rather than guessing from the request.

---

## 13. Dependency planner

The dependency planner produces a proposal before installation.

It must state:

- Package name
- Target workspace
- Dependency type
- Reason
- Existing alternative checked
- Expected bundle or runtime implication
- Required configuration
- Required environment variables
- License
- Removal path if experiment fails

The first version should require an explicit execution step after planning.

---

## 14. Verification engine

Verification is selected from connector requirements and changed scope.

### General checks

- Lint
- Type checking
- Unit tests
- Build
- Package validation
- Browser smoke test

### Motion checks

- Reduced-motion behavior
- Cleanup
- Duplicate timeline detection
- Property conflict
- Main-thread performance
- Deterministic screenshot checkpoint

### Scroll checks

- Keyboard and anchor navigation
- Native fallback
- Reduced-motion behavior
- Route cleanup
- Scroll restoration
- No duplicate transport

### React Three Fiber checks

- Lazy loading
- Static fallback
- Capped DPR
- Error boundary
- Resource cleanup
- No frame-loop React state abuse
- Mobile quality mode
- Context-loss behavior where feasible

### Storybook checks

- Stories build
- Interaction tests
- Accessibility checks
- Agent manifest generation
- Component docs available

### shadcn checks

- Registry item validates
- Dependencies are declared
- Installation works in a fixture
- Path aliases resolve
- Primitive base is correct
- Generated source respects workspace conventions

---

## 15. Evidence model

Suggested schema:

```json
{
  "id": "run_...",
  "request": "...",
  "timestamp": "...",
  "project": {
    "path": "...",
    "revision": "..."
  },
  "capabilities": [],
  "selection": [
    {
      "sdk": "motion",
      "reason": "...",
      "connectionMethods": ["mcp", "skill"],
      "runtimeRequired": true
    }
  ],
  "ownership": [],
  "filesChanged": [],
  "dependenciesAdded": [],
  "verification": [],
  "failures": [],
  "unverified": [],
  "agent": {
    "name": "Hermes",
    "model": "..."
  }
}
```

Store machine-readable JSON and generate a concise Markdown summary.

---

## 16. Control Center

The Control Center is a later user interface built on the core packages.

### Dashboard views

- SDK catalog
- Connector health
- Documentation freshness
- Installed runtime versions by workspace
- MCP connection status
- Skill status
- License status
- Security warnings
- Compatibility matrix
- Evaluation scores
- Agent usage history
- Evidence reports

### Connector page

Each connector page should show:

- SDK purpose
- Best-use cases
- Avoid-use cases
- Capabilities
- Current connection methods
- Official sources
- Runtime packages
- Supported frameworks
- Compatibility relationships
- Required credentials
- Version status
- Benchmark score
- Known issues
- Update history

### Actions

- Enable or disable connector
- Refresh official knowledge
- Run health check
- Run evaluation suite
- Approve or reject update
- Inspect changed skill instructions
- Pin version
- Open official documentation

The Control Center must not contain the only copy of core business logic.

---

## 17. Design-system integration

The Soren Design System should expose:

- Tokens
- Components
- Blocks
- Motion recipes
- Storybook stories
- Registry items
- Accessibility rules
- Visual standards

Soren SDK should expose those assets to agents through:

- Storybook MCP
- Private shadcn registry
- Design-data search
- Token lookup
- Recipe lookup
- Workspace-specific agent instructions

The SDK router remains general. The Soren Design System provides premium house style.

---

## 18. Governance

### Connector lifecycle

```text
proposed
→ experimental
→ approved
→ stable
→ deprecated
→ retired
```

### Required approvals

Human approval is required for:

- New global skills
- New remote MCP servers
- New credentials
- License-policy exceptions
- Public registry exposure
- Automatic publishing
- Removal of stable connectors
- Breaking connector schema changes

### Architecture decisions

Use ADRs for:

- Router strategy
- Connector schema
- Skill installation policy
- Documentation indexing strategy
- Evidence storage
- Release strategy
- Agent adapter design

---

## 19. Security

The platform must protect:

- Repository credentials
- MCP credentials
- Motion or other paid service keys
- Private registry credentials
- Package publishing access
- Agent session data
- Proprietary recipes

Required practices:

- Project-local configuration during experiments
- Environment variables for secrets
- No credentials in manifests
- Allowlisted MCP servers
- Pinned skill sources
- Source review before update
- Audit log for connector changes
- Least-privilege GitHub access
- No automatic public publishing
- No silent global configuration mutation

---

## 20. First release scope

The first release should prove one complete route.

Example request:

> Build a premium command palette with Motion transitions, use components from the Soren registry, document it in Storybook, and verify keyboard behavior and reduced motion.

Expected systems:

- Project inspector
- Capability decomposition
- Motion connector
- shadcn connector
- Storybook connector
- Compatibility check
- Dependency plan
- Verification plan
- Evidence report

After that route works, add GSAP, Lenis, and React Three Fiber composition.

---

## 21. Success metrics

### Routing quality

- Correct SDK selected for benchmark tasks
- Unnecessary SDK count
- Conflict detection rate
- Explanation clarity

### Code quality

- Build pass rate
- Test pass rate
- Accessibility check pass rate
- Cleanup issue rate
- Deprecated API rate
- Human correction rate

### Efficiency

- Context size
- Number of documentation calls
- Time to first valid implementation
- Dependency count
- Reuse of existing project packages

### User confidence

- Evidence completeness
- Visual acceptance
- Consistency with Soren Design System
- Ability to understand why an SDK was chosen

---

## 22. Final product statement

Soren SDK is the intelligence layer that allows agents to use modern frontend SDKs as disciplined specialists rather than as a random bag of libraries.

Its value comes from correct selection, current knowledge, safe composition, premium recipes, and verifiable output.
