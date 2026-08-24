import express from "express";
import { Effect } from "effect";
import { SignJWT, exportPKCS8, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

import { ID_JAG_ASSERTION_TYPE } from "./id-jag.js";
import { attachMcpOAuthRoutes, parseMcpOAuthTokenBody, MCP_OAUTH_TOKEN_PATH } from "./http.js";
import { createMcpOAuthForTests } from "./mcp-oauth-env.js";
import { loadMcpOAuthSigningMaterialEffect } from "./mcp-oauth-signing.js";

async function withTestApp(
  fn: (
    baseUrl: string,
    runtime: Awaited<ReturnType<typeof createMcpOAuthForTests>>
  ) => Promise<void>,
  options?: { adminApiKey?: string }
): Promise<void> {
  const idpSecret = "test-idp-hs256-secret-at-least-32-chars!!";
  const signingSecret = "test-mcp-oauth-signing-secret-32b!!";
  const audience = "https://mcp.clawql.test/";

  const runtime = await createMcpOAuthForTests({
    issuer: "https://auth.clawql.test",
    signingSecret,
    resourceAudience: audience,
  });

  await runtime.emaStore.saveOrgConfig({
    orgId: "acme",
    idpJwksUri: "https://idp.test/jwks",
    idpIssuer: "https://idp.test/",
    audience,
    hs256Secret: idpSecret,
    groupMappings: [{ idpGroup: "engineering", scope: ["execute", "search"] }],
  });

  const app = express();
  app.use(MCP_OAUTH_TOKEN_PATH, express.urlencoded({ extended: false }));
  app.use("/oauth/ema", express.json());
  attachMcpOAuthRoutes(app, runtime.server, {
    wellKnown: { issuer: runtime.config.issuer, resourceAudience: audience },
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
        grant_types_supported: string[];
      };
      expect(body.token_endpoint).toContain("/oauth/token");
      expect(body.grant_types_supported).toContain("urn:ietf:params:oauth:grant-type:jwt-bearer");
    });
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
    const runtime = await createMcpOAuthForTests({
      issuer: "https://auth.clawql.test",
      signing,
      resourceAudience: audience,
    });

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
