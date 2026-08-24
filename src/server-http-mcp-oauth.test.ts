import { Effect } from "effect";
import { SignJWT } from "jose";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { createMcpOAuthForTests, ID_JAG_ASSERTION_TYPE } from "clawql-auth";
import { createMcpHttpApp } from "./server-http.js";

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe("server-http MCP OAuth", () => {
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  function stash(key: string) {
    if (!(key in saved)) saved[key] = process.env[key];
  }

  it("accepts ClawQL-issued MCP OAuth bearer tokens on /mcp when hybrid validator is wired", async () => {
    stash("CLAWQL_AUTH_MODE");
    stash("CLAWQL_API_KEY");
    process.env.CLAWQL_AUTH_MODE = "apiKey";
    process.env.CLAWQL_API_KEY = "static-bootstrap-key";

    const signingSecret = "test-mcp-oauth-signing-secret-32b!!";
    const idpSecret = "test-idp-hs256-secret-at-least-32-chars!!";
    const audience = "https://mcp.clawql.test/";

    const mcpOAuthRuntime = await createMcpOAuthForTests({
      issuer: "https://auth.clawql.test",
      signingSecret,
      resourceAudience: audience,
    });
    await mcpOAuthRuntime.emaStore.saveOrgConfig({
      orgId: "acme",
      idpJwksUri: "https://idp.test/jwks",
      idpIssuer: "https://idp.test/",
      audience,
      hs256Secret: idpSecret,
      groupMappings: [{ idpGroup: "engineering", scope: ["execute", "search", "memory"] }],
    });

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

    const app = await createMcpHttpApp({
      skipSpecPreload: true,
      skipGraphqlAttach: true,
      mcpOAuthRuntime,
    });

    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}`;

    try {
      const tokenRes = await fetch(`${base}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
          org_id: "acme",
        }),
      });
      expect(tokenRes.status).toBe(200);
      const { access_token: accessToken } = (await tokenRes.json()) as { access_token: string };

      const mcpRes = await fetch(`${base}/mcp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      });
      expect(mcpRes.status).not.toBe(401);
    } finally {
      await closeHttpServer(server);
    }
  });
});
