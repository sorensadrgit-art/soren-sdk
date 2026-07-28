# SDK Connector Standard v2

## 1. Purpose

A connector is a Soren SDK-authored package that describes how one SDK product or built-in provider can be understood and used safely.

A connector does not become “official” merely because it references official sources.

## 2. Required model separation

A connector must distinguish:

- Connector publisher
- SDK product
- Integration artifacts
- Source authority
- Capability claims
- Ownership claims
- Verification requirements
- Related files
- Review and selection status

## 3. Required directory structure

```text
sdk-connectors/<connector-id>/
├── sdk.manifest.json
├── SKILL.md
├── docs.sources.json
├── compatibility.json
├── recipes/
├── validators/
├── evaluations/
├── migrations/
└── LICENSES/
```

During proposal or experimental status, files may be missing only when `relatedFiles` explicitly records their state.

## 4. Connector Schema v2

All manifests validate against:

```text
schemas/connector.schema.json
```

JSON Schema dialect:

```text
https://json-schema.org/draft/2020-12/schema
```

Required top-level fields:

```text
schemaVersion
connectorVersion
connector
product
sourceTrust
capabilityClaims
integrations
ownershipClaims
verification
relatedFiles
knowledge
```

## 5. Connector identity

The connector object contains:

- Stable lowercase kebab-case ID
- Human name
- Publisher
- Review status
- Selectable flag
- Explicit blockers

Example:

```json
{
  "connector": {
    "id": "motion",
    "name": "Motion connector",
    "publisher": "soren-sdk",
    "reviewStatus": "experimental",
    "selectable": false,
    "blockers": [
      "Runtime version policy unresolved",
      "Compatibility evaluations missing"
    ]
  }
}
```

A connector may be selected only when:

- `reviewStatus` is `approved` or `stable`
- `selectable` is `true`
- `blockers` is empty
- Policy permits it

## 6. Trust dimensions

Do not use one `trust` field.

Record:

### Source authority

- `official`
- `maintainer`
- `soren-approved`
- `community`
- `unknown`

### Integrity level

- `unverified`
- `url-recorded`
- `version-pinned`
- `commit-pinned`
- `digest-pinned`
- `signed`
- `attested`

Connector publisher and review status are separate.

## 7. Integration artifacts

Every package, MCP server, skill, CLI, docs source, validator, or recipe source is a separate integration artifact.

Required fields include:

- ID
- Kind
- Mode
- Status
- Source
- Version status
- Authorization
- Execution risk
- Data exposure
- Permissions

Optional artifact fields include:

- Package name
- Import paths
- Command
- Protocol and supported versions
- License expression
- Fallback
- Notes

Authentication, paid-plan, and data-exposure requirements belong to each integration artifact, not the connector as a whole.

## 8. Version rules

Machine-readable version fields must contain valid values.

Forbidden:

```json
{
  "supportedVersions": ["define during implementation"]
}
```

Use:

```json
{
  "version": {
    "status": "unresolved"
  }
}
```

An unresolved required runtime, skill, or protocol version blocks selection.

Record independently:

- Connector schema version
- Connector content version
- Runtime package version
- Skill commit or release
- MCP protocol version
- MCP server version
- Documentation version or retrieval digest

## 9. License rules

Use SPDX license expressions where known.

If a required artifact has an unresolved license or terms status:

- Record `NOASSERTION`
- Add a connector blocker
- Keep the connector non-selectable

Paid access and redistribution restrictions are separate from software license.

## 10. Capability claims

Capabilities come from the central ontology:

```text
capabilities/catalog.json
```

A claim defines:

- Capability ID
- Support level
- Confidence
- Conditions
- Limitations

Example:

```json
{
  "capability": "motion.layout",
  "support": "primary",
  "confidence": 1,
  "conditions": ["React project"],
  "limitations": ["Must not share transform ownership on the same element"]
}
```

Connectors may not invent ambiguous capability IDs without adding them to the ontology.

## 11. Native baseline

The Web Platform connector is first-class.

The router considers:

- CSS transitions
- CSS animations
- Web Animations API
- Native scrolling
- HTML semantics
- Browser focus behavior

before third-party SDKs.

## 12. Ownership claims

An ownership claim includes:

- Domain
- Scope
- Exclusivity
- Optional property list

Example:

```json
{
  "domain": "dom-transform",
  "scope": "selected-elements",
  "exclusive": true,
  "properties": ["transform"]
}
```

Ownership is resolved for a route and scope, not globally for the SDK.

## 13. Compatibility

`compatibility.json` records known relationships, but the policy engine remains authoritative.

Relationship statuses:

- `compatible`
- `compatible-with-ownership`
- `requires-adapter`
- `discouraged`
- `conflicting`
- `unknown`

Relationships may specify:

- Version range
- Framework
- Scope
- Ownership condition
- Required adapter
- Severity
- Verification

Absence means `unknown`.

## 14. Source records

`docs.sources.json` records:

- URL
- Source type
- Authority
- Product or artifact version
- Retrieved date
- Content digest when captured
- ETag or last-modified when available
- License or terms
- Allowed use: link, summarize, index, or copy
- Freshness policy

Do not copy entire third-party documentation into the repository.

Retrieved text is untrusted data and must not override Soren policy or agent system instructions.

## 15. Agent Skill requirements

`SKILL.md` must follow the Agent Skills specification.

Minimum frontmatter:

```yaml
---
name: connector-name
description: What the skill does and when to use it.
license: Reference to applicable terms
metadata:
  publisher: soren-sdk
  connector-version: "0.2.0"
---
```

Rules:

- Directory name matches skill name
- Lowercase letters, numbers, and hyphens
- Description states what and when
- Main `SKILL.md` remains focused
- Detailed material moves to `references/`
- Scripts are separately reviewed and sandboxed
- `allowed-tools` is experimental and never overrides Soren policy
- Progressive disclosure is preserved

## 16. Recipes

Every recipe defines:

- ID
- Connector
- Capabilities
- Framework and version constraints
- Status
- Ownership
- Dependencies
- Accessibility
- Reduced-motion behavior
- Cleanup
- Required checks
- Tested versions
- Source and license

## 17. Validators

Validator types:

- Manifest
- AST
- Package
- Configuration
- Runtime
- Browser
- Performance
- Accessibility
- Ownership
- Security

Each validator defines:

- ID
- Severity
- Detection
- Message
- Fix guidance
- Fixtures
- False-positive policy

## 18. Evaluations

Minimum connector gates:

- Manifest validates
- Required files are present or explicitly blocked
- Capability IDs exist
- Source records exist
- Version and license policy resolves
- Best-use and avoid-use guidance exists
- Positive route case passes
- Negative route case passes
- Metamorphic route cases pass
- Known hard conflicts are rejected
- At least one implementation evaluation passes
- Human quality review passes
- Security review passes

Hard constraint or forbidden-connector failures are not averaged into a passing score.

## 19. Connector lifecycle

```text
proposed
→ experimental
→ approved
→ stable
→ deprecated
→ retired
```

`blocked` may be entered from any active state.

### Proposed

Not selectable.

### Experimental

Not selectable by default. Policy may permit explicit test routes.

### Approved

Selectable for internal use.

### Stable

Production history, current sources, full evaluations, and release discipline.

### Deprecated

Not selected for new work unless explicitly required.

### Retired

Unavailable for routing.

### Blocked

Disabled because of security, legal, compatibility, or integrity risk.

## 20. Acceptance criteria

A connector becomes approved only when:

- Schema v2 validates
- Publisher and source authority are accurate
- Required integration artifacts resolve
- Runtime versions are machine-valid
- SPDX license policy resolves
- Required files are present
- Capability and ownership claims are reviewed
- Compatibility policies cover the active catalog
- Hard security checks pass
- Positive, negative, and metamorphic evaluations pass
- Human visual or implementation review passes
- Connector lock data can be generated
