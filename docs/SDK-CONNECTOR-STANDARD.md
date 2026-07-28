# SDK Connector Standard

## 1. Purpose

An SDK connector is the complete agent-facing integration definition for one SDK.

A connector is not complete merely because it lists an npm package.

It must teach the system:

- What the SDK does
- When to select it
- When not to select it
- How agents receive current knowledge
- How it combines with other SDKs
- How it should be installed
- How its output should be tested
- How to detect misuse

---

## 2. Required directory structure

```text
sdk-connectors/<connector-id>/
├── sdk.manifest.json
├── SKILL.md
├── docs.sources.json
├── compatibility.json
├── recipes/
├── validators/
├── tests/
├── migrations/
└── AGENTS.md
```

Not every first draft requires implementation files in every folder, but the manifest must explicitly identify missing sections.

---

## 3. Connector identity

Connector IDs must:

- Use lowercase kebab-case
- Remain stable
- Prefer the current official SDK name
- Record previous names as aliases

Example:

```json
{
  "id": "motion",
  "name": "Motion",
  "aliases": ["motion-one", "framer-motion"]
}
```

Aliases assist detection. They must not cause obsolete package installation.

---

## 4. Required manifest fields

```json
{
  "schemaVersion": "1.0.0",
  "connectorVersion": "0.1.0",
  "id": "motion",
  "name": "Motion",
  "status": "experimental",
  "trust": "official",
  "categories": [],
  "aliases": [],
  "capabilities": [],
  "connectionMethods": [],
  "runtime": {},
  "frameworks": [],
  "bestFor": [],
  "avoidFor": [],
  "owns": [],
  "compatibilityFile": "./compatibility.json",
  "sourcesFile": "./docs.sources.json",
  "requiredChecks": [],
  "security": {},
  "knowledge": {}
}
```

---

## 5. Connection methods

Supported values:

- `official-mcp`
- `official-skill`
- `official-docs`
- `soren-skill`
- `runtime-adapter`
- `cli`
- `local-server`
- `remote-api`

Each method must record:

- Availability
- Setup requirements
- Authentication
- Cost or subscription requirement
- Local or remote execution
- Data exposure
- Supported agents
- Fallback

Example:

```json
{
  "type": "official-mcp",
  "status": "available",
  "requiresAuth": true,
  "requiresPaidPlan": true,
  "supportedAgents": ["claude-code", "codex", "opencode", "custom"],
  "fallback": "official-docs"
}
```

---

## 6. Capabilities

Capabilities should be specific.

Good:

```text
motion.presence
motion.layout
interaction.drag
scroll.triggered-animation
testing.component-context
registry.component-install
```

Avoid:

```text
animation
frontend
useful
```

A connector may support the same capability with different strength.

Future schema may include:

```json
{
  "id": "motion.layout",
  "support": "primary",
  "confidence": 1.0
}
```

---

## 7. Best-use and avoid-use rules

Every connector must define both.

Example:

```json
{
  "bestFor": [
    "React layout transitions",
    "Presence animation",
    "Drag and gesture interactions"
  ],
  "avoidFor": [
    "Smooth-scroll transport",
    "Complex WebGL rendering",
    "A section already owned by another transform animation engine"
  ]
}
```

`avoidFor` is essential. Without it, agents overuse familiar SDKs.

---

## 8. Ownership declarations

Possible ownership domains:

- `scroll-transport`
- `scroll-trigger`
- `component-state`
- `presence`
- `layout`
- `gesture`
- `timeline`
- `dom-transform`
- `webgl-transform`
- `route-transition`
- `focus-management`
- `vector-state-machine`
- `component-source-distribution`
- `component-agent-context`

Ownership may include constraints:

```json
{
  "domain": "dom-transform",
  "scope": "selected-elements",
  "exclusive": true
}
```

---

## 9. Compatibility file

Example:

```json
{
  "relationships": [
    {
      "with": "lenis",
      "status": "compatible",
      "conditions": [
        "Lenis owns scroll transport",
        "Motion owns element animation"
      ]
    },
    {
      "with": "gsap",
      "status": "compatible-with-ownership",
      "conditions": [
        "Do not animate the same property on the same element"
      ],
      "severityOnViolation": "error"
    }
  ]
}
```

The absence of a relationship should produce `unknown`, not automatic compatibility.

---

## 10. Source file

`docs.sources.json` should record authoritative sources.

```json
{
  "sources": [
    {
      "type": "official-docs",
      "url": "https://example.com/docs",
      "scope": "primary",
      "retrievedAt": "2026-07-27"
    },
    {
      "type": "official-repository",
      "url": "https://github.com/example/project",
      "scope": "source"
    }
  ]
}
```

Do not copy entire third-party documentation into the repository.

Store:

- Source URL
- Version
- Retrieval date
- Search index metadata
- Soren-authored summaries
- Small excerpts only when legally and operationally appropriate

---

## 11. Skill file

`SKILL.md` should answer:

1. What this SDK owns
2. When the router should select it
3. When the router should avoid it
4. Correct setup
5. Correct lifecycle
6. Framework rules
7. SSR rules
8. Accessibility rules
9. Performance rules
10. Cleanup rules
11. Required tests
12. Common mistakes
13. Approved recipes
14. Official sources

Do not make `SKILL.md` an unstructured documentation dump.

---

## 12. Recipes

A recipe is a trusted implementation pattern.

Each recipe should contain metadata:

```yaml
id: motion-dialog-presence
connector: motion
capabilities:
  - motion.presence
framework: react
status: approved
testedWith:
  runtime: "supported range"
requiredChecks:
  - reduced-motion
  - focus-restoration
```

Recipe content should explain:

- Intent
- When to use
- When not to use
- Dependencies
- Ownership
- Implementation
- Cleanup
- Accessibility
- Verification

---

## 13. Validators

Validators detect misuse.

Types:

- Static AST validator
- Package manifest validator
- Configuration validator
- Browser runtime validator
- Performance validator
- Accessibility validator
- Ownership validator

Examples:

- Motion component factory created during render
- Missing GSAP cleanup context
- Lenis initialized twice
- Uncapped React Three Fiber DPR
- Storybook MCP configured without required Storybook version
- Registry item missing dependency metadata

Each validator needs:

- ID
- Severity
- Message
- Detection method
- Recommended fix
- Test fixtures

---

## 14. Connector tests

Minimum tests:

- Manifest schema validates
- Capability mapping is non-empty
- Official source list exists
- Best-use and avoid-use lists exist
- Compatibility file validates
- Required checks are recognized
- Alias detection works
- Unsupported runtime version is rejected
- At least one positive route benchmark passes
- At least one negative route benchmark passes

---

## 15. Status lifecycle

### Proposed

Idea only. Not selectable.

### Experimental

Selectable only when the route explicitly allows experimental connectors.

### Approved

Reviewed for normal internal use.

### Stable

Has reliable source updates, tests, evaluations, and production use.

### Deprecated

Still recognized but not selected for new work unless required.

### Retired

Blocked from new routing.

---

## 16. Connector acceptance criteria

A connector may become approved when:

- Manifest is complete
- Official sources are recorded
- Runtime packages and imports are correct
- Capabilities are specific
- Avoid-use guidance exists
- Compatibility relationships cover first-wave SDKs
- Required validators exist
- Positive and negative route tests pass
- At least one implementation evaluation passes
- Security and license review is complete
- Human review approves the output quality
