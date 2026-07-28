# Governance and Security

## 1. Why governance matters

Soren SDK connects agents to tools that may:

- Execute commands
- Install packages
- Read local projects
- Contact remote services
- Require paid credentials
- Modify repositories
- Influence generated code

Connector instructions therefore require the same discipline as source code.

---

## 2. Trust model

### Official

Maintained by the SDK owner or official organization.

Examples:

- Official documentation
- Official repository
- Official MCP
- Official skill

### Soren-approved

Created or reviewed by Soren for this platform.

### Community-reviewed

Useful secondary integration that has been manually reviewed.

### Experimental

Incomplete, changing, or not fully verified.

### Blocked

Known unsafe, incompatible, abandoned, or legally unsuitable.

Only approved trust levels may be selected by default.

---

## 3. Update policy

Connector updates should:

1. Detect upstream change
2. Produce a diff
3. Identify changed instructions
4. Run connector tests
5. Run route evaluations
6. Run implementation evaluations when material
7. Require approval for breaking or security-sensitive changes
8. Record source version and retrieval date

Do not automatically replace trusted skills with unreviewed upstream content.

---

## 4. Credentials

Never store credentials in:

- Connector manifests
- Skills
- Recipes
- Tests
- Git history
- Evidence reports

Use:

- Environment variables
- Secret managers
- Local ignored configuration
- Short-lived credentials
- Least-privilege access

The connector should declare that a credential is required without containing it.

---

## 5. MCP policy

Every MCP server record must state:

- Official owner
- Local or remote
- Tools exposed
- Resources exposed
- Filesystem access
- Network access
- Authentication
- Data transmitted
- Required permissions
- Fallback
- Disable procedure

Remote MCP servers require explicit approval.

---

## 6. Skill policy

Global skill installation is not automatic.

Preferred progression:

1. Inspect skill source
2. Pin version or commit
3. Install project-locally
4. Run evaluations
5. Approve
6. Optionally promote to shared global skill storage

Record:

- Source
- Version
- Hash
- Installation location
- Supported agents
- Last review date

---

## 7. Dependency policy

Before adding a runtime dependency:

- Confirm the capability is required
- Check existing dependencies
- Check maintenance status
- Check license
- Check known security issues
- Check bundle and runtime impact
- Check SSR and browser compatibility
- Identify removal path
- Add only to the correct workspace

Use frozen lockfiles in CI.

---

## 8. Repository permissions

Agents should receive only permissions required for the task.

Recommended:

- Read-only inspection by default
- Branch-scoped writes
- Pull requests instead of direct protected-branch writes
- No package publishing permission for ordinary implementation
- No secret administration
- No repository deletion
- Human approval for releases

---

## 9. Evidence privacy

Evidence reports should avoid:

- Full private prompts when unnecessary
- Secret values
- Private user data
- Agent hidden reasoning
- Unbounded command logs
- Proprietary source code outside the affected file list

Store the facts needed to reproduce and verify the change.

---

## 10. Connector retirement

Retire a connector when:

- SDK is abandoned
- Security risk is unresolved
- License becomes incompatible
- APIs are no longer supported
- A replacement is approved
- Connector evaluations repeatedly fail

Retirement process:

1. Mark deprecated
2. Stop new default selection
3. Add replacement guidance
4. Add migration plan
5. Mark retired after supported migration period
6. Preserve historical evidence

---

## 11. Release policy

Before a Soren SDK release:

- Schemas validate
- Connector catalog validates
- Core tests pass
- Routing evaluations pass
- Compatibility evaluations pass
- Evidence schema remains compatible or has migration
- Changelog is written
- Security review is complete
- No credentials are present
- Release is approved

Automatic public publishing is out of scope for the initial release.
