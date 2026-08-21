import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { AuthEvent } from "../audit/auth-events.js";
import {
  createMCPOAuthServer,
  createMemoryMcpClientRegistry,
  createMemoryMcpRefreshStore,
  hashMcpClientSecret,
} from "./mcp-oauth.js";

describe("MCPOAuthServer", () => {
  const secret = "test-mcp-oauth-signing-secret-32b!!";

  function setup(events: AuthEvent[] = []) {
    const salt = randomBytes(8).toString("hex");
    const clientSecret = "client-secret-value";
    const clients = createMemoryMcpClientRegistry([
      {
        clientId: "cline-agent",
        salt,
        clientSecretHash: hashMcpClientSecret(salt, clientSecret),
        defaultScope: ["execute", "search", "memory"],
        defaultRole: "operator",
        orgId: "acme",
        teamId: "platform",
      },
    ]);
    const refreshStore = createMemoryMcpRefreshStore();
    const server = createMCPOAuthServer(
      {
        issuer: "https://auth.clawql.test",
        signingSecret: secret,
        tokenTtlSeconds: 300,
        refreshTokenTtlSeconds: 3600,
        eventSink: (e) => {
          events.push(e);
        },
      },
      clients,
      refreshStore
    );
    return { server, clientSecret, events, refreshStore };
  }

  it("issues and validates client_credentials tokens with ATR claims", async () => {
    const events: AuthEvent[] = [];
    const { server, clientSecret } = setup(events);

    const token = await server.issueToken({
      grantType: "client_credentials",
      clientId: "cline-agent",
      clientSecret,
    });

    expect(token.token_type).toBe("Bearer");
    expect(token.expires_in).toBe(300);
    expect(token.refresh_token).toMatch(/^mcr_/);

    const claims = await server.validateToken(token.access_token);
    expect(claims.sub).toBe("cline-agent");
    expect(claims.orgId).toBe("acme");
    expect(claims.scope).toEqual(["execute", "search", "memory"]);
    expect(events.some((e) => e.type === "MCP_TOKEN_ISSUED")).toBe(true);
  });

  it("rotates refresh tokens and rejects reused hashes", async () => {
    const { server, clientSecret, refreshStore } = setup();
    const first = await server.issueToken({
      grantType: "client_credentials",
      clientId: "cline-agent",
      clientSecret,
    });

    const second = await server.issueToken({
      grantType: "refresh_token",
      clientId: "cline-agent",
      refreshToken: first.refresh_token!,
    });

    expect(second.access_token).not.toBe(first.access_token);
    expect(second.refresh_token).not.toBe(first.refresh_token);

    const oldHash = createHash("sha256").update(first.refresh_token!).digest("hex");
    expect(refreshStore.map.has(oldHash)).toBe(false);

    await expect(
      server.issueToken({
        grantType: "refresh_token",
        clientId: "cline-agent",
        refreshToken: first.refresh_token!,
      })
    ).rejects.toThrow(/invalid_grant/);
  });

  it("rejects bad client secrets and invalid access tokens", async () => {
    const { server } = setup();
    await expect(
      server.issueToken({
        grantType: "client_credentials",
        clientId: "cline-agent",
        clientSecret: "wrong",
      })
    ).rejects.toThrow(/invalid_client/);

    await expect(server.validateToken("not.a.jwt")).rejects.toBeTruthy();
  });
});
