import { describe, expect, it } from "vitest";

import { auditEventDigest, InMemoryAuditSink } from "../src/audit.js";

const NOW = "2026-08-06T12:00:00.000Z";

describe("audit chain", () => {
  it("creates a deterministic genesis audit event", () => {
    const event = new InMemoryAuditSink().append({ code: "TOOL_CALLED", occurredAt: NOW });
    expect(event.sequence).toBe(1); expect(event.previousDigest).toBeNull(); expect(event.code).toBe("TOOL_CALLED"); expect(event.occurredAt).toBe(NOW);
    expect(event.digest).toBe(auditEventDigest({ sequence: 1, code: "TOOL_CALLED", occurredAt: NOW, previousDigest: null }));
  });
  it("chains each event to the previous event digest", () => {
    const sink = new InMemoryAuditSink(); const first = sink.append({ code: "A", occurredAt: NOW }); const second = sink.append({ code: "B", occurredAt: NOW }); const third = sink.append({ code: "C", occurredAt: NOW });
    expect([first.sequence, second.sequence, third.sequence]).toEqual([1, 2, 3]); expect(second.previousDigest).toBe(first.digest); expect(third.previousDigest).toBe(second.digest);
  });
  it("produces equal digests for equal canonical event inputs", () => expect(auditEventDigest({ sequence: 1, code: "A", occurredAt: NOW, previousDigest: null })).toBe(auditEventDigest({ sequence: 1, code: "A", occurredAt: NOW, previousDigest: null })));
  it("returns immutable defensive audit records", () => {
    const sink = new InMemoryAuditSink(); const event = sink.append({ code: "A", occurredAt: NOW }); expect(Object.isFrozen(event)).toBe(true); expect(Object.isFrozen(sink.readAll())).toBe(true); expect(Object.isFrozen(sink.readAll()[0])).toBe(true); expect(() => { (event as { code: string }).code = "changed"; }).toThrow(); expect(sink.readAll()[0]?.code).toBe("A");
  });
  it.each([["empty code", { sequence: 1, code: "", occurredAt: NOW, previousDigest: null }], ["whitespace-only code", { sequence: 1, code: " ", occurredAt: NOW, previousDigest: null }], ["malformed timestamp", { sequence: 1, code: "A", occurredAt: "invalid", previousDigest: null }], ["unsafe sequence", { sequence: Number.MAX_SAFE_INTEGER + 1, code: "A", occurredAt: NOW, previousDigest: null }], ["malformed previous digest", { sequence: 2, code: "A", occurredAt: NOW, previousDigest: "invalid" }]])("rejects %s", (_name, event) => expect(() => auditEventDigest(event as never)).toThrow(TypeError));
});
