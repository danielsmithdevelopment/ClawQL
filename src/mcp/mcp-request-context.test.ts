import { describe, expect, it } from "vitest";
import { runWithMcpRequestContext, tenantScopedSessionId } from "./mcp-request-context.js";

describe("tenantScopedSessionId (S4)", () => {
  it("returns undefined without a session", () => {
    expect(tenantScopedSessionId(undefined)).toBeUndefined();
    expect(tenantScopedSessionId({ tenantId: "acme" })).toBeUndefined();
  });

  it("namespaces session id with tenant when both are set", () => {
    expect(tenantScopedSessionId({ sessionId: "s1", tenantId: "acme" })).toBe("acme::s1");
    expect(tenantScopedSessionId({ sessionId: "s1" })).toBe("s1");
  });

  it("is readable from ALS during a request", () => {
    const scoped = runWithMcpRequestContext({ sessionId: "s", tenantId: "t" }, () =>
      tenantScopedSessionId({ sessionId: "s", tenantId: "t" })
    );
    expect(scoped).toBe("t::s");
  });
});
