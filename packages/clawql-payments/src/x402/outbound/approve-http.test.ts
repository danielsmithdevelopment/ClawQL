import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { SignJWT } from "jose";
import { operatorApproveAuthTimeMaxSec, resolveOutboundApproveOperator } from "./approve-http.js";
import { hashOperatorApproveKey } from "./operator-key.js";

function fakeReq(headers: Record<string, string>): Request {
  return { headers } as unknown as Request;
}

const HS_SECRET = "test-secret-at-least-32-chars!!";

async function mintOidcToken(opts: {
  role?: string;
  aud?: string;
  authTime?: number;
  sub?: string;
  tenantId?: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    atr: {
      sub: opts.sub ?? "human-1",
      role: opts.role ?? "operator",
      scope: ["payments:approve"],
      tenant_id: opts.tenantId ?? "acme",
    },
  };
  if (opts.authTime !== undefined) claims.auth_time = opts.authTime;
  let jwt = new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt(now);
  if (opts.aud) jwt = jwt.setAudience(opts.aud);
  return jwt.setExpirationTime(now + 3600).sign(new TextEncoder().encode(HS_SECRET));
}

describe("resolveOutboundApproveOperator (audit Y1/Y2/Z1–Z3)", () => {
  it("accepts hashed operator approve key and binds principal from config (Z2/Z3)", async () => {
    const plaintext = "op-secret";
    const result = await resolveOutboundApproveOperator(
      fakeReq({
        "x-clawql-operator-key": plaintext,
        "x-clawql-operator-id": "spoofed-from-header",
      }),
      {
        CLAWQL_OPERATOR_APPROVE_KEY_HASH: hashOperatorApproveKey(plaintext),
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
      expect(result.identity.channel).toBe("operator-key");
    }
  });

  it("refuses plaintext CLAWQL_OPERATOR_APPROVE_KEY without allow flag (Z2)", async () => {
    const result = await resolveOutboundApproveOperator(
      fakeReq({ "x-clawql-operator-key": "op-secret" }),
      {
        CLAWQL_OPERATOR_APPROVE_KEY: "op-secret",
        CLAWQL_OPERATOR_ID: "dana",
        CLAWQL_AUTH_MODE: "apiKey",
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/KEY_HASH|plaintext/i);
  });

  it("accepts legacy plaintext key when explicitly allowed (Z2 migration)", async () => {
    const result = await resolveOutboundApproveOperator(
      fakeReq({ "x-clawql-operator-key": "op-secret" }),
      {
        CLAWQL_OPERATOR_APPROVE_KEY: "op-secret",
        CLAWQL_ALLOW_OPERATOR_APPROVE_KEY_PLAINTEXT: "1",
        CLAWQL_OPERATOR_ID: "dana",
        CLAWQL_TENANT_ID: "acme",
      }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity.principal).toBe("operator:dana");
      expect(result.identity.channel).toBe("operator-key");
    }
  });

  it("ignores x-clawql-operator-id header for attribution (Z3)", async () => {
    const plaintext = "op-secret";
    const result = await resolveOutboundApproveOperator(
      fakeReq({
        "x-clawql-operator-key": plaintext,
        "x-clawql-operator-id": "attacker",
      }),
      {
        CLAWQL_OPERATOR_APPROVE_KEY_HASH: hashOperatorApproveKey(plaintext),
        CLAWQL_TENANT_ID: "acme",
      }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity.principal).toBe("operator:operator-key");
      expect(result.identity.principal).not.toContain("attacker");
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

  it("refuses OIDC without dedicated approve audience even with fresh auth_time (Z1 window closed)", async () => {
    const authTime = Math.floor(Date.now() / 1000) - 60;
    const token = await mintOidcToken({ authTime, aud: "clawql-mcp" });
    const result = await resolveOutboundApproveOperator(
      fakeReq({ authorization: `Bearer ${token}` }),
      {
        CLAWQL_AUTH_MODE: "oidc",
        CLAWQL_AUTH_OIDC_HS256_SECRET: HS_SECRET,
        CLAWQL_AUTH_OIDC_AUDIENCE: "clawql-mcp",
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/CLAWQL_OPERATOR_APPROVE_OIDC_AUDIENCE/);
  });

  it("accepts OIDC with dedicated approve audience (Z1 human-approved path)", async () => {
    const token = await mintOidcToken({ aud: "clawql-payments-approve" });
    const result = await resolveOutboundApproveOperator(
      fakeReq({ authorization: `Bearer ${token}` }),
      {
        CLAWQL_AUTH_MODE: "oidc",
        CLAWQL_AUTH_OIDC_HS256_SECRET: HS_SECRET,
        CLAWQL_AUTH_OIDC_AUDIENCE: "clawql-mcp",
        CLAWQL_OPERATOR_APPROVE_OIDC_AUDIENCE: "clawql-payments-approve",
      }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity.channel).toBe("oidc");
      expect(result.identity.principal).toBe("operator:human-1");
      expect(result.identity.tenantId).toBe("acme");
    }
  });

  it("refuses when approve audience equals MCP audience (Z1 misconfig)", async () => {
    const token = await mintOidcToken({ aud: "clawql-mcp" });
    const result = await resolveOutboundApproveOperator(
      fakeReq({ authorization: `Bearer ${token}` }),
      {
        CLAWQL_AUTH_MODE: "oidc",
        CLAWQL_AUTH_OIDC_HS256_SECRET: HS_SECRET,
        CLAWQL_AUTH_OIDC_AUDIENCE: "clawql-mcp",
        CLAWQL_OPERATOR_APPROVE_OIDC_AUDIENCE: "clawql-mcp",
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/must differ|MCP-token/);
  });

  it("refuses MCP-audience token when approve audience is configured (Z1)", async () => {
    const authTime = Math.floor(Date.now() / 1000) - 30;
    const token = await mintOidcToken({ authTime, aud: "clawql-mcp" });
    const result = await resolveOutboundApproveOperator(
      fakeReq({ authorization: `Bearer ${token}` }),
      {
        CLAWQL_AUTH_MODE: "oidc",
        CLAWQL_AUTH_OIDC_HS256_SECRET: HS_SECRET,
        CLAWQL_AUTH_OIDC_AUDIENCE: "clawql-mcp",
        CLAWQL_OPERATOR_APPROVE_OIDC_AUDIENCE: "clawql-payments-approve",
      }
    );
    // jwtVerify fails on wrong aud → 401 from catch, or explicit 403
    expect(result.ok).toBe(false);
  });

  it("enforces auth_time when CLAWQL_OPERATOR_APPROVE_REQUIRE_AUTH_TIME=1", async () => {
    const authTime = Math.floor(Date.now() / 1000) - 3600;
    const token = await mintOidcToken({
      authTime,
      aud: "clawql-payments-approve",
    });
    const result = await resolveOutboundApproveOperator(
      fakeReq({ authorization: `Bearer ${token}` }),
      {
        CLAWQL_AUTH_MODE: "oidc",
        CLAWQL_AUTH_OIDC_HS256_SECRET: HS_SECRET,
        CLAWQL_AUTH_OIDC_AUDIENCE: "clawql-mcp",
        CLAWQL_OPERATOR_APPROVE_OIDC_AUDIENCE: "clawql-payments-approve",
        CLAWQL_OPERATOR_APPROVE_REQUIRE_AUTH_TIME: "1",
        CLAWQL_OPERATOR_APPROVE_AUTH_TIME_MAX_SEC: "300",
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/auth_time|re-authenticate/);
  });
});

describe("operatorApproveAuthTimeMaxSec", () => {
  it("defaults to 300 and clamps", () => {
    expect(operatorApproveAuthTimeMaxSec({})).toBe(300);
    expect(operatorApproveAuthTimeMaxSec({ CLAWQL_OPERATOR_APPROVE_AUTH_TIME_MAX_SEC: "10" })).toBe(
      300
    );
    expect(
      operatorApproveAuthTimeMaxSec({ CLAWQL_OPERATOR_APPROVE_AUTH_TIME_MAX_SEC: "120" })
    ).toBe(120);
  });
});
