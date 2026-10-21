import { describe, expect, it } from "vitest";
import { composeMostRestrictive, composedGateToMcpResult } from "./compose.js";
import type { OpenAppaGateVerdict } from "./types.js";

const allow: OpenAppaGateVerdict = {
  allow: true,
  decision: { protocol: 1, decision: "allow_call" },
};

const openAppaBlock: OpenAppaGateVerdict = {
  allow: false,
  status: "blocked",
  reason: "OpenAPPA refuse undeclared",
  decision: { protocol: 1, decision: "refuse", class: "undeclared_tool" },
};

const openAppaMandate: OpenAppaGateVerdict = {
  allow: false,
  status: "mandate_required",
  reason: "OpenAPPA requires attention: human-approval",
  decision: { protocol: 1, decision: "deny_call" },
};

describe("composeMostRestrictive", () => {
  it("OpenAPPA allow + IFC allow → allow", () => {
    const r = composeMostRestrictive(allow, null);
    expect(r.allow).toBe(true);
  });

  it("OpenAPPA allow never overrides IFC block", () => {
    const r = composeMostRestrictive(allow, {
      status: "blocked",
      reason: "session IFC: untrusted → external",
      mechanism: "untrusted_read_taint",
    });
    expect(r.allow).toBe(false);
    if (r.allow) throw new Error("expected deny");
    expect(r.status).toBe("blocked");
    expect(r.mechanism).toBe("session_ifc");
    expect(r.layers).toHaveLength(2);
  });

  it("OpenAPPA block stops the call", () => {
    const r = composeMostRestrictive(openAppaBlock, null);
    expect(r.allow).toBe(false);
    if (r.allow) throw new Error("expected deny");
    expect(r.mechanism).toBe("openappa_layer5");
  });

  it("OpenAPPA allow + IFC mandate → mandate", () => {
    const r = composeMostRestrictive(allow, {
      status: "mandate_required",
      reason: "park destructive notify",
      mechanism: "park_destructive_write",
      executionId: "exec-1",
    });
    expect(r.allow).toBe(false);
    if (r.allow) throw new Error("expected deny");
    expect(r.status).toBe("mandate_required");
    expect(r.executionId).toBe("exec-1");
  });

  it("OpenAPPA mandate + IFC allow → one OpenAPPA mandate", () => {
    const r = composeMostRestrictive(openAppaMandate, null);
    expect(r.allow).toBe(false);
    if (r.allow) throw new Error("expected deny");
    expect(r.status).toBe("mandate_required");
    expect(r.mechanism).toBe("openappa_layer5");
  });

  it("OpenAPPA mandate + IFC mandate → single coalesced approval with both reasons", () => {
    const r = composeMostRestrictive(openAppaMandate, {
      status: "mandate_required",
      reason: "park destructive notify",
      mechanism: "park_destructive_write",
      executionId: "exec-9",
    });
    expect(r.allow).toBe(false);
    if (r.allow) throw new Error("expected deny");
    expect(r.status).toBe("mandate_required");
    expect(r.mechanism).toBe("composed_mandate");
    expect(r.reason).toContain("openappa_layer5");
    expect(r.reason).toContain("park_destructive_write");
    expect(r.executionId).toBe("exec-9");
    const mcp = composedGateToMcpResult(r);
    const body = JSON.parse(mcp.content[0].text) as {
      layers: { layer: string }[];
      mechanism: string;
    };
    expect(body.mechanism).toBe("composed_mandate");
    expect(body.layers).toHaveLength(2);
  });

  it("OpenAPPA mandate + IFC block → block wins", () => {
    const r = composeMostRestrictive(openAppaMandate, {
      status: "blocked",
      reason: "data_flow refuse",
      mechanism: "data_flow",
    });
    expect(r.allow).toBe(false);
    if (r.allow) throw new Error("expected deny");
    expect(r.status).toBe("blocked");
  });
});
