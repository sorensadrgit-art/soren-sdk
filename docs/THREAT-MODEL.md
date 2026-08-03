# Soren SDK Threat Model

## 1. Security objective

Soren SDK brokers knowledge, tools, packages, and code execution for coding agents. The security objective is to ensure that no source, connector, tool, agent, or runtime artifact receives more authority than explicitly granted.

## 2. Protected assets

- Source repositories
- Credentials and API keys
- Private registries
- Agent configuration
- Local filesystem
- Network access
- Package lockfiles
- Build and release credentials
- Proprietary recipes
- Evidence integrity
- User consent and approvals

## 3. Trust boundaries

1. User to Soren SDK
2. Agent to Soren SDK
3. Soren SDK to local project
4. Soren SDK to remote documentation
5. Soren SDK to MCP servers
6. Soren SDK to package registries
7. Soren SDK to local command execution
8. Soren SDK to GitHub or other source control
9. Connector content to runtime decisions

## 4. Primary threats

### Prompt injection in retrieved content

Documentation, examples, issues, README files, registry metadata, and tool descriptions may contain instructions intended to redirect the agent.

Mitigations:

- Treat retrieved text as data, not system instructions
- Separate source excerpts from connector policy
- Do not grant tools based on retrieved text
- Allowlist official domains and pinned repositories
- Record source digest and origin
- Require review before promoting content to approved skill instructions

### Malicious or compromised Agent Skills

A skill may include executable scripts or broad `allowed-tools`.

Mitigations:

- Validate Agent Skills format
- Pin source commit or digest
- Inspect scripts separately from Markdown
- Treat `allowed-tools` as advisory and experimental
- Require Soren policy approval
- Run scripts in a sandbox
- Deny global installation by default

### Malicious MCP server or tool metadata

Tool annotations and descriptions are untrusted.

Mitigations:

- Per-server allowlist
- Protocol-version negotiation
- Tool inventory diff before activation
- Explicit per-run grants
- Human-readable consent for mutating tools
- Tool-call input validation
- Response-size limits
- Audit events
- Kill switch and disable procedure

### Confused deputy and token passthrough

An MCP proxy may misuse a shared downstream identity or accept tokens not issued for it.

Mitigations:

- No token passthrough
- Validate token audience and issuer
- Per-client consent
- Short-lived credentials
- Credential-derived principal
- Separate downstream credentials by connector and workspace
- Maintain an auditable authorization chain

### SSRF during discovery and OAuth

Metadata or redirects may target internal or link-local services.

Mitigations:

- HTTPS in production
- Exact redirect validation
- Block private, loopback, link-local, and metadata ranges unless explicitly allowed for local development
- Validate every redirect hop
- Use an egress proxy in hosted deployments
- Pin DNS resolution when appropriate
- Never open authorization URLs through a shell

### Local MCP server compromise

A local MCP command can execute with user privileges.

Mitigations:

- Display the exact command before first run
- Require explicit approval
- Prefer stdio for local servers
- Sandbox filesystem and network
- Restrict working directory
- Deny sensitive paths by default
- Use command allowlists
- Record process hash and package digest
- Time and resource limits

### Dependency and connector supply-chain compromise

Packages, skills, containers, or binaries may be replaced or compromised.

Mitigations:

- Pin versions and digests
- Verify provenance when available
- Record SLSA or GitHub artifact attestations
- Generate and retain SBOMs for released artifacts
- Use SPDX license expressions
- Review new transitive dependencies
- Frozen lockfiles in CI
- Minimum package-age policy where appropriate

### Unauthorized project mutation

A read-only request may cause writes or commands.

Mitigations:

- Separate `plan` and `apply`
- Default to read-only
- Branch or worktree isolation
- Approval token scoped to the exact execution plan
- Reject plan drift before execution
- Generate diff and rollback data
- Never write directly to protected branches

### Evidence tampering

An agent may claim tests passed or modify evidence.

Mitigations:

- Generate evidence from check runners, not prose
- Content-address evidence
- Include project and catalog digests
- Preserve raw check artifacts separately
- Sign release evidence when appropriate
- Distinguish `passed`, `failed`, `not-required`, and `not-run`

### Cross-workspace data leakage

A connector or agent may expose one project’s data to another.

Mitigations:

- Workspace-scoped principals
- Separate storage namespaces
- No shared prompt cache containing source
- Per-workspace credentials
- Redaction before telemetry
- Deny remote project-content exposure unless explicitly approved

## 5. Consent classes

### No consent required

- Reading public connector metadata
- Reading project files inside approved scope
- Static route calculation
- Local schema validation

### Session consent

- Remote documentation retrieval
- Read-only MCP calls
- Local development-server access

### Per-plan approval

- Package installation
- File writes
- Commands
- Remote mutating tools
- Registry authentication
- Build or test execution that sends data remotely

### Separate release approval

- Publishing packages
- Public registry updates
- Deployment
- Artifact signing
- Credential or permission changes

## 6. Security release gates

A release must fail when:

- Connector schema is invalid
- Required source or version is unresolved
- A selectable connector lacks license metadata
- A remote tool lacks permission metadata
- A mutating integration lacks consent classification
- A hard policy evaluation fails
- Secrets are detected
- Evidence reports required checks as passed without runner evidence

## 7. Phase 9 apply sandbox threats

The apply sandbox is the isolated mutation boundary for explicitly approved
immutable plans. It adds the following threat surface and mitigations.

### Approval replay

An attacker reuses a consumed approval to apply a plan again.

Mitigations:

- One-time nonce tracked by the apply service
- Integrity digest over all binding fields
- Nonce consumed only after a completed run

### Plan / project / policy drift

An attacker applies a plan, project, or policy that differs from the one the
approval was bound to.

Mitigations:

- Exact plan ID and immutable digest binding
- Exact project snapshot ID binding
- Exact policy snapshot digest binding
- Hard gates before the first mutation

### Path traversal and absolute paths

An attacker writes outside the approved scope.

Mitigations:

- NUL-byte and invalid-encoding rejection
- `..` and traversal rejection
- Absolute-path rejection unless explicitly permitted
- Writable-root and deny-path enforcement

### Symlink escape and TOCTOU races

An attacker swaps a directory for a symlink to escape the sandbox.

Mitigations:

- Real-path resolution and recheck before every mutation
- Symlink-escape rejection
- Special-file (device, socket, FIFO) rejection

### Quota bypass

An attacker exceeds file, byte, operation, or time limits.

Mitigations:

- File-count, byte, operation, and time limits enforced in the sandbox
- Approval limits must be within the sandbox policy

### Command and network execution

An attacker requests command execution or network access.

Mitigations:

- Command execution disabled in Phase 9
- Network access disabled in Phase 9
- `execution.denied` hard gate

### Protected-workspace mutation

An attacker applies to a protected branch or the original workspace.

Mitigations:

- VCS isolation port checks protected-branch state
- Original workspace untouched by default
- Temporary-copy isolation for the first real adapter

### Partial-write corruption and rollback bypass

An attacker corrupts a file mid-apply or bypasses rollback.

Mitigations:

- Atomic writes (temp file + rename)
- Before-state digests captured before each mutation
- Reverse rollback with digest verification
- Never report success after rollback failure

### Cancellation races

An attacker races cancellation against apply.

Mitigations:

- Cancellation checked before each operation
- Cancelled runs roll back applied operations
- Crash-state recovery records for interrupted runs

### Evidence forgery and credential leakage

An attacker forges evidence or leaks credentials.

Mitigations:

- Evidence events are redacted by default
- Approval data never contains credentials
- Evidence sink is a local port; Phase 8 will persist artifacts
