# Security Policy

## Project status

Soren SDK is currently an architecture and early implementation project. The SDK routing and execution engine is not yet released for production use.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose credentials, execute commands, modify repositories, bypass approval, or leak private project data.

Use GitHub's private vulnerability reporting feature for this repository when enabled. Until it is enabled, contact the repository owner privately through their GitHub profile.

Include:

- Affected file or component
- Reproduction steps
- Expected and actual behavior
- Potential impact
- Suggested mitigation, when known

Do not include real secrets or private user data.

## Security boundaries

The project treats the following as security-sensitive:

- Connector and skill updates
- MCP server configuration
- Package installation
- Command execution
- Filesystem and network permissions
- Authentication and OAuth
- Private registry access
- Evidence generation
- Release publishing

## Current policy

- No secrets in the repository
- No automatic global skill installation
- No automatic public publishing
- Read-only inspection by default
- Explicit approval before project mutation
- Remote MCP servers require review
- Tool descriptions and retrieved documentation are untrusted input
- Runtime dependencies belong in target workspaces, not in agent global environments

See:

- `docs/GOVERNANCE-SECURITY.md`
- `docs/THREAT-MODEL.md`
