import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import {
  defaultAdminAtrClaims,
  loadGatewayAuthConfig,
  resolveAtrClaimsFromHeaders,
  resolveAtrClaimsFromHeadersEffect,
  resolveAuthMode,
  type GatewayAuthConfig,
} from "./gateway.js";
import { createMcpOAuthForTests } from "./inbound/mcp-oauth-env.js";

describe("clawql-auth gateway", () => {
  const prevMode = process.env.CLAWQL_AUTH_MODE;
  const prevKey = process.env.CLAWQL_API_KEY;

  afterEach(() => {
    if (prevMode === undefined) delete process.env.CLAWQL_AUTH_MODE;
    else process.env.CLAWQL_AUTH_MODE = prevMode;
    if (prevKey === undefined) delete process.env.CLAWQL_API_KEY;
    else process.env.CLAWQL_API_KEY = prevKey;
  });

  it("defaults to noAuth with admin claims", () => {
    delete process.env.CLAWQL_AUTH_MODE;
    expect(resolveAuthMode()).toBe("noAuth");
    const r = resolveAtrClaimsFromHeaders({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.claims.role).toBe("admin");
      expect(r.claims.scope).toContain("*");
    }
  });

  it("apiKey mode rejects missing key", () => {
    process.env.CLAWQL_AUTH_MODE = "apiKey";
    process.env.CLAWQL_API_KEY = "secret";
    const bad = resolveAtrClaimsFromHeaders({}, loadGatewayAuthConfig());
    expect(bad.ok).toBe(false);

    const good = resolveAtrClaimsFromHeaders(
      { authorization: "Bearer secret" },
      loadGatewayAuthConfig()
    );
    expect(good.ok).toBe(true);
  });

  it("apiKey mode rejects wrong-length and wrong-value keys (timing-safe compare)", () => {
    process.env.CLAWQL_AUTH_MODE = "apiKey";
    process.env.CLAWQL_API_KEY = "correct-length-key!!";
    const short = resolveAtrClaimsFromHeaders({ "x-api-key": "short" }, loadGatewayAuthConfig());
    expect(short.ok).toBe(false);
    const wrong = resolveAtrClaimsFromHeaders(
      { "x-api-key": "correct-length-key!?" },
      loadGatewayAuthConfig()
    );
    expect(wrong.ok).toBe(false);
  });

  it("does not trust x-clawql-role without a valid API key", () => {
    process.env.CLAWQL_AUTH_MODE = "apiKey";
    process.env.CLAWQL_API_KEY = "secret";
    const spoof = resolveAtrClaimsFromHeaders(
      { "x-clawql-role": "admin", "x-api-key": "nope" },
      loadGatewayAuthConfig()
    );
    expect(spoof.ok).toBe(false);
  });

  it("apiKeyClaimsResolver accepts virtual keys and ignores spoofed role headers", () => {
    const config: GatewayAuthConfig = {
      mode: "apiKey",
      apiKeyClaimsResolver: (presented) => {
        if (presented !== "clawql-vk-test") return null;
        return {
          ok: true,
          claims: {
            sub: "vk_abc",
            role: "operator",
            scope: ["execute", "search", "memory"],
            tenantId: "acme",
            virtualKeyId: "vk_abc",
          },
        };
      },
    };
    const ok = resolveAtrClaimsFromHeaders(
      {
        authorization: "Bearer clawql-vk-test",
        "x-clawql-role": "admin",
        "x-clawql-subject": "spoofed",
      },
      config
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.claims.tenantId).toBe("acme");
      expect(ok.claims.role).toBe("operator");
      expect(ok.claims.sub).toBe("vk_abc");
      expect(ok.claims.virtualKeyId).toBe("vk_abc");
    }
  });

  it("prefers resolver over static CLAWQL_API_KEY when both match", () => {
    const config: GatewayAuthConfig = {
      mode: "apiKey",
      apiKey: "shared-secret",
      apiKeyClaimsResolver: (presented) => {
        if (presented !== "shared-secret") return null;
        return {
          ok: true,
          claims: {
            sub: "vk_1",
            role: "operator",
            scope: ["execute", "search", "memory"],
            tenantId: "team-from-vk",
            virtualKeyId: "vk_1",
          },
        };
      },
    };
    const ok = resolveAtrClaimsFromHeaders({ "x-api-key": "shared-secret" }, config);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.claims.tenantId).toBe("team-from-vk");
      expect(ok.claims.virtualKeyId).toBe("vk_1");
    }
  });

  it("falls back to static key when resolver returns null", () => {
    const config: GatewayAuthConfig = {
      mode: "apiKey",
      apiKey: "static-only",
      apiKeyClaimsResolver: () => null,
    };
    const ok = resolveAtrClaimsFromHeaders({ authorization: "Bearer static-only" }, config);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.claims.sub).toBe("api-key");
      expect(ok.claims.tenantId).toBeUndefined();
    }
  });

  it("allows apiKey mode with resolver and no static CLAWQL_API_KEY", () => {
    const config: GatewayAuthConfig = {
      mode: "apiKey",
      apiKeyClaimsResolver: (presented) => {
        if (presented !== "vk-only") return null;
        return {
          ok: true,
          claims: {
            sub: "vk_only",
            role: "operator",
            scope: ["execute", "search", "memory"],
            tenantId: "solo",
            virtualKeyId: "vk_only",
          },
        };
      },
    };
    expect(resolveAtrClaimsFromHeaders({}, config).ok).toBe(false);
    const ok = resolveAtrClaimsFromHeaders({ "x-api-key": "vk-only" }, config);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.claims.tenantId).toBe("solo");
  });

  it("defaultAdminAtrClaims is stable shape", () => {
    expect(defaultAdminAtrClaims("u1")).toEqual({
      sub: "u1",
      role: "admin",
      scope: ["*"],
    });
  });

  it("mcpOAuthValidator accepts ClawQL-issued bearer tokens in hybrid mode", async () => {
    const runtime = await createMcpOAuthForTests({
      issuer: "https://auth.clawql.test",
      signingSecret: "test-mcp-oauth-signing-secret-32b!!",
      clients: [
        {
          clientId: "mcp-client",
          defaultScope: ["execute", "search"],
          defaultRole: "operator",
        },
      ],
    });
    const issued = await runtime.server.issueToken({
      grantType: "client_credentials",
      clientId: "mcp-client",
    });

    const claims = await Effect.runPromise(
      resolveAtrClaimsFromHeadersEffect(
        { authorization: `Bearer ${issued.access_token}` },
        {
          mode: "apiKey",
          apiKey: "unused",
          mcpOAuthValidator: runtime.validateBearer,
        }
      )
    );
    expect(claims.sub).toBe("mcp-client");
    expect(claims.scope).toEqual(["execute", "search"]);
  });

  it("resolveAuthMode recognizes mcpOAuth", () => {
    process.env.CLAWQL_AUTH_MODE = "mcpOAuth";
    expect(resolveAuthMode()).toBe("mcpOAuth");
  });
});
