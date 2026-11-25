import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { resolveOutboundApproveOperator } from "./approve-http.js";

function fakeReq(headers: Record<string, string>): Request {
  return { headers } as unknown as Request;
}

describe("resolveOutboundApproveOperator (audit Y1/Y2)", () => {
  it("accepts dedicated operator approve key", async () => {
    const result = await resolveOutboundApproveOperator(
      fakeReq({ "x-clawql-operator-key": "op-secret" }),
      {
        CLAWQL_OPERATOR_APPROVE_KEY: "op-secret",
        CLAWQL_OPERATOR_ID: "dana",
        CLAWQL_TENANT_ID: "acme",
        CLAWQL_AUTH_MODE: "apiKey",
        CLAWQL_API_KEY: "mcp-key",
      }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity.principal).toBe("operator:dana");
      expect(result.identity.tenantId).toBe("acme");
    }
  });

  it("refuses noAuth", async () => {
    const result = await resolveOutboundApproveOperator(fakeReq({}), {
      CLAWQL_AUTH_MODE: "noAuth",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/noAuth/);
  });

  it("refuses MCP apiKey mode without operator key", async () => {
    const result = await resolveOutboundApproveOperator(
      fakeReq({ authorization: "Bearer mcp-key" }),
      {
        CLAWQL_AUTH_MODE: "apiKey",
        CLAWQL_API_KEY: "mcp-key",
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/MCP API keys|OPERATOR_APPROVE/);
  });

  it("refuses mcpOAuth mode", async () => {
    const result = await resolveOutboundApproveOperator(fakeReq({ authorization: "Bearer tok" }), {
      CLAWQL_AUTH_MODE: "mcpOAuth",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/MCP OAuth/);
  });
});
