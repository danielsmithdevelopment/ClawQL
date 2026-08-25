import { createHash, randomBytes } from "node:crypto";
import { Effect } from "effect";
import { SignJWT, exportPKCS8, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

import type { AuthEvent } from "../audit/auth-events.js";
import {
  ID_JAG_ASSERTION_TYPE,
  ID_JAG_JWT_BEARER_GRANT,
  createMemoryEmaConfigStore,
  resetIdJagJwksCacheForTests,
} from "./id-jag.js";
import {
  createMCPOAuthServer,
  createMemoryMcpClientRegistry,
  createMemoryMcpRefreshStore,
  hashMcpClientSecret,
} from "./mcp-oauth.js";
import { loadMcpOAuthSigningMaterialEffect } from "./mcp-oauth-signing.js";

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

  it("exchanges ID-JAG assertions for access tokens scoped by IdP groups", async () => {
    resetIdJagJwksCacheForTests();
    const events: AuthEvent[] = [];
    const idpSecret = "test-idp-hs256-secret-at-least-32-chars!!";
    const resourceAudience = "https://mcp.clawql.test/";
    const emaStore = createMemoryEmaConfigStore([
      {
        orgId: "acme",
        idpJwksUri: "https://idp.test/jwks",
        idpIssuer: "https://idp.test/",
        audience: resourceAudience,
        hs256Secret: idpSecret,
        groupMappings: [
          {
            idpGroup: "engineering",
            role: "operator",
            scope: ["execute", "search", "memory"],
          },
          {
            idpGroup: "finance",
            role: "analyst",
            scope: ["search"],
          },
        ],
      },
    ]);

    const salt = randomBytes(8).toString("hex");
    const clientSecret = "client-secret-value";
    const clients = createMemoryMcpClientRegistry([
      {
        clientId: "cline-agent",
        salt,
        clientSecretHash: hashMcpClientSecret(salt, clientSecret),
        defaultScope: ["execute"],
        orgId: "acme",
      },
    ]);
    const refreshStore = createMemoryMcpRefreshStore();
    const server = createMCPOAuthServer(
      {
        issuer: "https://auth.clawql.test",
        signingSecret: secret,
        resourceAudience,
        emaConfigStore: emaStore,
        eventSink: (e) => {
          events.push(e);
        },
      },
      clients,
      refreshStore
    );

    const assertion = await new SignJWT({
      groups: ["engineering"],
      org_id: "acme",
      email: "dev@acme.com",
      token_type: ID_JAG_ASSERTION_TYPE,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-42")
      .setIssuer("https://idp.test/")
      .setAudience(resourceAudience)
      .setJti("assertion-jti-42")
      .setIssuedAt(Math.floor(Date.now() / 1000))
      .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
      .sign(new TextEncoder().encode(idpSecret));

    const token = await server.issueToken({
      grantType: ID_JAG_JWT_BEARER_GRANT,
      assertion,
      orgId: "acme",
    });

    expect(token.token_type).toBe("Bearer");
    expect(token.refresh_token).toBeUndefined();
    expect(token.scope).toBe("execute search memory");

    const claims = await server.validateToken(token.access_token);
    expect(claims.sub).toBe("user-42");
    expect(claims.orgId).toBe("acme");
    expect(claims.role).toBe("operator");
    expect(claims.scope).toEqual(["execute", "search", "memory"]);
    expect(claims.idpGroups).toEqual(["engineering"]);
    expect(claims.email).toBe("dev@acme.com");

    const issued = events.find((e) => e.type === "MCP_TOKEN_ISSUED");
    expect(issued).toMatchObject({
      type: "MCP_TOKEN_ISSUED",
      grantType: "id_jag",
      subjectId: "user-42",
      orgId: "acme",
      role: "operator",
      scope: ["execute", "search", "memory"],
      idpGroups: ["engineering"],
      matchedIdpGroups: ["engineering"],
      idJagJti: "assertion-jti-42",
    });
  });

  it("rejects ID-JAG when no IdP groups match configured mappings", async () => {
    resetIdJagJwksCacheForTests();
    const idpSecret = "test-idp-hs256-secret-at-least-32-chars!!";
    const resourceAudience = "https://mcp.clawql.test/";
    const emaStore = createMemoryEmaConfigStore([
      {
        orgId: "acme",
        idpJwksUri: "https://idp.test/jwks",
        idpIssuer: "https://idp.test/",
        audience: resourceAudience,
        hs256Secret: idpSecret,
        groupMappings: [{ idpGroup: "engineering", scope: ["execute"] }],
      },
    ]);

    const server = createMCPOAuthServer(
      {
        issuer: "https://auth.clawql.test",
        signingSecret: secret,
        emaConfigStore: emaStore,
      },
      createMemoryMcpClientRegistry([]),
      createMemoryMcpRefreshStore()
    );

    const assertion = await new SignJWT({
      groups: ["contractors"],
      org_id: "acme",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-99")
      .setIssuer("https://idp.test/")
      .setAudience(resourceAudience)
      .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
      .sign(new TextEncoder().encode(idpSecret));

    await expect(
      server.issueToken({
        grantType: "id_jag",
        assertion,
        orgId: "acme",
      })
    ).rejects.toThrow(/no_matching_idp_groups/);
  });

  it("issues and validates RS256 access tokens with JWKS metadata", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const signing = await Effect.runPromise(
      loadMcpOAuthSigningMaterialEffect({
        privateKeyPem: await exportPKCS8(privateKey),
        keyId: "rs256-test",
      })
    );
    const salt = randomBytes(8).toString("hex");
    const clientSecret = "client-secret-value";
    const rsServer = createMCPOAuthServer(
      {
        issuer: "https://auth.clawql.test",
        signing,
      },
      createMemoryMcpClientRegistry([
        {
          clientId: "cline-agent",
          salt,
          clientSecretHash: hashMcpClientSecret(salt, clientSecret),
          defaultScope: ["execute"],
        },
      ]),
      createMemoryMcpRefreshStore()
    );

    const token = await rsServer.issueToken({
      grantType: "client_credentials",
      clientId: "cline-agent",
      clientSecret,
    });
    expect(token.access_token.split(".")).toHaveLength(3);

    const header = JSON.parse(
      Buffer.from(token.access_token.split(".")[0]!, "base64url").toString("utf8")
    ) as { alg: string; kid?: string };
    expect(header.alg).toBe("RS256");
    expect(header.kid).toBe("rs256-test");

    const claims = await rsServer.validateToken(token.access_token);
    expect(claims.scope).toEqual(["execute"]);
    expect(rsServer.getJwks().keys).toHaveLength(1);
  });

  it("issues authorization_code tokens via PKCE S256", async () => {
    const { generateCodeChallenge, generateCodeVerifier } = await import("../oauth/auth-code.js");
    const { createMemoryMcpAuthorizationCodeStore } = await import("./mcp-auth-code-store.js");

    const events: AuthEvent[] = [];
    const redirectUri = "http://127.0.0.1:9999/callback";
    const clients = createMemoryMcpClientRegistry([
      {
        clientId: "cursor-desktop",
        defaultScope: ["execute", "search"],
        defaultRole: "operator",
        orgId: "acme",
        redirectUris: [redirectUri],
      },
    ]);
    const server = createMCPOAuthServer(
      {
        issuer: "https://auth.clawql.test",
        signingSecret: secret,
        authCodeStore: createMemoryMcpAuthorizationCodeStore(),
        eventSink: (e) => {
          events.push(e);
        },
      },
      clients,
      createMemoryMcpRefreshStore()
    );

    expect(server.getSupportedGrantTypes()).toContain("authorization_code");

    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    const authorized = await server.createAuthorizationCode({
      clientId: "cursor-desktop",
      redirectUri,
      codeChallenge: challenge,
      scope: ["execute"],
      state: "xyz",
      claims: {
        sub: "alice@acme.test",
        role: "operator",
        scope: ["execute", "search", "memory"],
        orgId: "acme",
      },
    });

    expect(authorized.code).toMatch(/^mca_/);
    expect(authorized.redirectUrl).toContain(`code=${authorized.code}`);
    expect(authorized.redirectUrl).toContain("state=xyz");

    const token = await server.issueToken({
      grantType: "authorization_code",
      clientId: "cursor-desktop",
      code: authorized.code,
      codeVerifier: verifier,
      redirectUri,
    });

    const claims = await server.validateToken(token.access_token);
    expect(claims.sub).toBe("alice@acme.test");
    expect(claims.scope).toEqual(["execute"]);
    expect(token.refresh_token).toMatch(/^mcr_/);
    expect(events.some((e) => e.type === "MCP_TOKEN_ISSUED")).toBe(true);

    await expect(
      server.issueToken({
        grantType: "authorization_code",
        clientId: "cursor-desktop",
        code: authorized.code,
        codeVerifier: verifier,
        redirectUri,
      })
    ).rejects.toThrow(/invalid_grant/);
  });

  it("rejects authorization_code with bad PKCE verifier", async () => {
    const { generateCodeChallenge, generateCodeVerifier } = await import("../oauth/auth-code.js");
    const { createMemoryMcpAuthorizationCodeStore } = await import("./mcp-auth-code-store.js");

    const redirectUri = "http://127.0.0.1:9999/callback";
    const server = createMCPOAuthServer(
      {
        issuer: "https://auth.clawql.test",
        signingSecret: secret,
        authCodeStore: createMemoryMcpAuthorizationCodeStore(),
      },
      createMemoryMcpClientRegistry([
        {
          clientId: "cursor-desktop",
          defaultScope: ["execute"],
          redirectUris: [redirectUri],
        },
      ]),
      createMemoryMcpRefreshStore()
    );

    const verifier = generateCodeVerifier();
    const authorized = await server.createAuthorizationCode({
      clientId: "cursor-desktop",
      redirectUri,
      codeChallenge: generateCodeChallenge(verifier),
      claims: { sub: "bob", role: "operator", scope: ["execute"] },
    });

    await expect(
      server.issueToken({
        grantType: "authorization_code",
        clientId: "cursor-desktop",
        code: authorized.code,
        codeVerifier: generateCodeVerifier(),
        redirectUri,
      })
    ).rejects.toThrow(/pkce_failed/);
  });
});
