# Evidence

Evidence is runner-derived, immutable, content-addressed data. Results must bind to the exact execution-plan ID and digest. Artifact content must be supplied during ingestion and match each declared SHA-256 digest.

Evidence preserves project, catalog, policy, route, and plan identities. It canonicalizes checks and artifact digests, so independent result ordering cannot alter the evidence digest. Failures, partial results, timeouts, and cancellations remain visible. Redaction may remove sensitive diagnostic material but may never hide a check ID, state, plan binding, or artifact digest.
