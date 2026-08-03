# Phase 6 surface equivalence

Application, REST/MCP protocol surfaces, in-process SDK, and HTTP SDK share application outcomes and typed public errors. Equivalent requests preserve success/failure, error code, project-root authorization, policy digest, lock result, plan identity, and evidence identity. Transport metadata is surface-specific only.

Project-root authorization is deny-by-default, resolves real paths, rejects traversal, prefix/symlink escapes, and avoids internal-path disclosure. Module imports do not start listeners.

Apply is unavailable through REST, MCP, CLI, and SDK boundaries.