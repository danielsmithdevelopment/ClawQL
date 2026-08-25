import express from "express";
import { Effect } from "effect";
import { SignJWT, exportPKCS8, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

import { generateCodeChallenge, generateCodeVerifier } from "../oauth/auth-code.js";
import { ID_JAG_ASSERTION_TYPE } from "./id-jag.js";
import {
  attachMcpOAuthRoutes,
  parseHttpBasicClientAuth,
  parseMcpOAuthTokenBody,
  MCP_OAUTH_AUTHORIZE_PATH,
  MCP_OAUTH_REVOKE_PATH,
  MCP_OAUTH_TOKEN_PATH,
} from "./http.js";
import { createMcpOAuthForTests } from "./mcp-oauth-env.js";
import { loadMcpOAuthSigningMaterialEffect } from "./mcp-oauth-signing.js";
import { hashMcpClientSecret } from "./mcp-oauth.js";

async function withTestApp(
  fn: (
    baseUrl: string,
    runtime: import("./mcp-oauth-env.js").McpOAuthRuntime
  ) => Promise<void>,
  options?: {
    adminApiKey?: string;
    resolveAuthorizeClaims?: true;
    redirectUri?: string;
  }
): Promise<void> {
  const idpSecret = "test-idp-hs256-secret-at-least-32-chars!!";
  const signingSecret = "test-mcp-oauth-signing-secret-32b!!";
  const audience = "https://mcp.clawql.test/";
  const redirectUri = options?.redirectUri ?? "http://127.0.0.1:9999/callback";
  const confidentialSalt = "http-basic-test-salt";
  const confidentialSecret = "client-secret-value";

  const runtime = await Effect.runPromise(createMcpOAuthForTests({
    issuer: "https://auth.clawql.test",
    signingSecret,
    resourceAudience: audience,
    clients: [
      {
        clientId: "cursor-desktop",
        defaultScope: ["execute", "search"],
        defaultRole: "operator",
        orgId: "acme",
        redirectUris: [redirectUri],
      },
      {
        clientId: "cline-agent",
        salt: confidentialSalt,
        clientSecretHash: hashMcpClientSecret(confidentialSalt, confidentialSecret),
        defaultScope: ["execute", "search", "memory"],
        defaultRole: "operator",
        orgId: "acme",
      },
    ],
  }));

  await Effect.runPromise(
    runtime.emaStore.saveOrgConfig({
      orgId: "acme",
      idpJwksUri: "https://idp.test/jwks",
      idpIssuer: "https://idp.test/",
      audience,
      hs256Secret: idpSecret,
      groupMappings: [{ idpGroup: "engineering", scope: ["execute", "search"] }],
    })
  );

  const app = express();
  app.use(MCP_OAUTH_TOKEN_PATH, express.urlencoded({ extended: false }));
  app.use(MCP_OAUTH_REVOKE_PATH, express.urlencoded({ extended: false }));
  app.use("/oauth/ema", express.json());
  attachMcpOAuthRoutes(app, runtime.server, {
    wellKnown: { issuer: runtime.config.issuer, resourceAudience: audience },
    resolveAuthorizeClaims: options?.resolveAuthorizeClaims
      ? async () => ({
          sub: "alice@acme.test",
          role: "operator",
          scope: ["execute", "search", "memory"],
          orgId: "acme",
        })
      : undefined,
    emaAdmin: options?.adminApiKey
      ? { store: runtime.emaStore, adminApiKey: options.adminApiKey }
      : undefined,
  });

  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}`, runtime);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

describe("attachMcpOAuthRoutes", () => {
  it("parses oauth token form bodies", () => {
    const req = parseMcpOAuthTokenBody({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: "jwt-here",
      org_id: "acme",
    });
    expect(req.grantType).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(req.assertion).toBe("jwt-here");
    expect(req.orgId).toBe("acme");
  });

  it("parses authorization_code token bodies", () => {
    const req = parseMcpOAuthTokenBody({
      grant_type: "authorization_code",
      client_id: "cursor-desktop",
      code: "mca_abc",
      code_verifier: "verifier",
      redirect_uri: "http://127.0.0.1:9999/callback",
    });
    expect(req.grantType).toBe("authorization_code");
    expect(req.code).toBe("mca_abc");
    expect(req.codeVerifier).toBe("verifier");
    expect(req.redirectUri).toBe("http://127.0.0.1:9999/callback");
  });

  it("parses HTTP Basic client credentials", () => {
    const encoded = Buffer.from("cline-agent:client-secret-value", "utf8").toString("base64");
    expect(parseHttpBasicClientAuth(`Basic ${encoded}`)).toEqual({
      clientId: "cline-agent",
      clientSecret: "client-secret-value",
    });
  });

  it("POST /oauth/token accepts client_secret_basic without body credentials", async () => {
    await withTestApp(async (baseUrl, runtime) => {
      const basic = Buffer.from("cline-agent:client-secret-value", "utf8").toString("base64");
      const res = await fetch(`${baseUrl}${MCP_OAUTH_TOKEN_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
        },
        body: new URLSearchParams({ grant_type: "client_credentials" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { access_token: string; refresh_token?: string };
      expect(body.access_token).toBeTruthy();
      const claims = await Effect.runPromise(runtime.validateBearer(body.access_token));
      expect(claims.sub).toBe("cline-agent");
      expect(claims.orgId).toBe("acme");
    });
  });

  it("POST /oauth/revoke revokes refresh tokens and rejects reuse", async () => {
    await withTestApp(async (baseUrl) => {
      const basic = Buffer.from("cline-agent:client-secret-value", "utf8").toString("base64");
      const issued = await fetch(`${baseUrl}${MCP_OAUTH_TOKEN_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
        },
        body: new URLSearchParams({ grant_type: "client_credentials" }),
      });
      expect(issued.status).toBe(200);
      const tokenBody = (await issued.json()) as { refresh_token: string };

      const revoked = await fetch(`${baseUrl}${MCP_OAUTH_REVOKE_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
        },
        body: new URLSearchParams({ token: tokenBody.refresh_token }),
      });
      expect(revoked.status).toBe(200);
      expect(await revoked.json()).toEqual({});

      const reuse = await fetch(`${baseUrl}${MCP_OAUTH_TOKEN_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokenBody.refresh_token,
        }),
      });
      expect(reuse.status).toBe(400);
      const err = (await reuse.json()) as { error: string };
      expect(err.error).toBe("invalid_grant");
    });
  });

  it("POST /oauth/token exchanges ID-JAG assertions", async () => {
    const idpSecret = "test-idp-hs256-secret-at-least-32-chars!!";
    const audience = "https://mcp.clawql.test/";

    await withTestApp(async (baseUrl) => {
      const assertion = await new SignJWT({
        groups: ["engineering"],
        org_id: "acme",
        token_type: ID_JAG_ASSERTION_TYPE,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("user-42")
        .setIssuer("https://idp.test/")
        .setAudience(audience)
        .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
        .sign(new TextEncoder().encode(idpSecret));

      const res = await fetch(`${baseUrl}${MCP_OAUTH_TOKEN_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
          org_id: "acme",
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { access_token: string; scope: string };
      expect(body.access_token).toBeTruthy();
      expect(body.scope).toBe("execute search");
    });
  });

  it("GET /.well-known/oauth-authorization-server includes token endpoint", async () => {
    await withTestApp(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        token_endpoint: string;
        revocation_endpoint: string;
        grant_types_supported: string[];
        authorization_endpoint?: string;
        token_endpoint_auth_methods_supported: string[];
      };
      expect(body.token_endpoint).toContain("/oauth/token");
      expect(body.revocation_endpoint).toContain(MCP_OAUTH_REVOKE_PATH);
      expect(body.token_endpoint_auth_methods_supported).toContain("client_secret_basic");
      expect(body.grant_types_supported).toContain("urn:ietf:params:oauth:grant-type:jwt-bearer");
      expect(body.grant_types_supported).toContain("authorization_code");
      expect(body.authorization_endpoint).toBeUndefined();
    });
  });

  it("authorize → token PKCE round-trip redirects and mints ATR JWT", async () => {
    const redirectUri = "http://127.0.0.1:9999/callback";
    await withTestApp(
      async (baseUrl, runtime) => {
        const discovery = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
        const meta = (await discovery.json()) as {
          authorization_endpoint: string;
          code_challenge_methods_supported: string[];
        };
        expect(meta.authorization_endpoint).toContain(MCP_OAUTH_AUTHORIZE_PATH);
        expect(meta.code_challenge_methods_supported).toEqual(["S256"]);

        const verifier = generateCodeVerifier();
        const challenge = generateCodeChallenge(verifier);
        const authorizeUrl = new URL(`${baseUrl}${MCP_OAUTH_AUTHORIZE_PATH}`);
        authorizeUrl.searchParams.set("client_id", "cursor-desktop");
        authorizeUrl.searchParams.set("redirect_uri", redirectUri);
        authorizeUrl.searchParams.set("response_type", "code");
        authorizeUrl.searchParams.set("code_challenge", challenge);
        authorizeUrl.searchParams.set("code_challenge_method", "S256");
        authorizeUrl.searchParams.set("scope", "execute");
        authorizeUrl.searchParams.set("state", "s1");

        const authRes = await fetch(authorizeUrl, { redirect: "manual" });
        expect(authRes.status).toBe(302);
        const location = authRes.headers.get("location");
        expect(location).toBeTruthy();
        const redirected = new URL(location!);
        expect(redirected.origin + redirected.pathname).toBe(redirectUri);
        const code = redirected.searchParams.get("code");
        expect(code).toMatch(/^mca_/);
        expect(redirected.searchParams.get("state")).toBe("s1");

        const tokenRes = await fetch(`${baseUrl}${MCP_OAUTH_TOKEN_PATH}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: "cursor-desktop",
            code: code!,
            code_verifier: verifier,
            redirect_uri: redirectUri,
          }),
        });
        expect(tokenRes.status).toBe(200);
        const tokenBody = (await tokenRes.json()) as { access_token: string; scope: string };
        const claims = await Effect.runPromise(runtime.validateBearer(tokenBody.access_token));
        expect(claims.sub).toBe("alice@acme.test");
        expect(claims.scope).toEqual(["execute"]);
      },
      { resolveAuthorizeClaims: true, redirectUri }
    );
  });

  it("PUT /oauth/ema/orgs/:orgId persists org config when admin key matches", async () => {
    await withTestApp(
      async (baseUrl) => {
        const put = await fetch(`${baseUrl}/oauth/ema/orgs/acme-corp`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": "admin-test-key",
          },
          body: JSON.stringify({
            provider: "okta",
            oktaDomain: "acme.okta.com",
            audience: "https://mcp.clawql.test/",
            groupMappings: [{ idpGroup: "platform", scope: ["memory"] }],
          }),
        });
        expect(put.status).toBe(200);

        const get = await fetch(`${baseUrl}/oauth/ema/orgs/acme-corp`, {
          headers: { "x-api-key": "admin-test-key" },
        });
        expect(get.status).toBe(200);
        const saved = (await get.json()) as { orgId: string; idpIssuer: string };
        expect(saved.orgId).toBe("acme-corp");
        expect(saved.idpIssuer).toContain("acme.okta.com");
      },
      { adminApiKey: "admin-test-key" }
    );
  });

  it("GET /.well-known/jwks.json publishes RS256 verifying keys", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const signing = await Effect.runPromise(
      loadMcpOAuthSigningMaterialEffect({
        privateKeyPem: await exportPKCS8(privateKey),
      })
    );
    const audience = "https://mcp.clawql.test/";
    const runtime = await Effect.runPromise(createMcpOAuthForTests({
      issuer: "https://auth.clawql.test",
      signing,
      resourceAudience: audience,
    }));

    const app = express();
    attachMcpOAuthRoutes(app, runtime.server, {
      wellKnown: { issuer: runtime.config.issuer, resourceAudience: audience },
      jwks: runtime.jwks,
    });

    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/.well-known/jwks.json`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { keys: Array<{ alg?: string; kid?: string }> };
      expect(body.keys.length).toBeGreaterThan(0);
      expect(body.keys[0]?.alg).toBe("RS256");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
});
