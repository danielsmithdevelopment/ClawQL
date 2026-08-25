/**
 * Integration discipline for mcp-api-adapter JWT edge auth:
 * mint with the real ClawQL MCP OAuth AS, verify via JWKS on the adapter,
 * and prove untrusted / expired bearers are rejected (no silent pass-through).
 */

import { createServer, type Server } from "node:http";
import { Effect } from "effect";
import { SignJWT, exportPKCS8, generateKeyPair } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import {
  createMcpOAuthForTests,
  hashMcpClientSecret,
  loadMcpOAuthSigningMaterialEffect,
} from "clawql-auth";
import { createMcpApiAdapterApp } from "mcp-api-adapter";
import type { ToolCatalog } from "mcp-api-adapter";

const emptyCatalog: ToolCatalog = {
  tools: [],
  fetchedAt: new Date().toISOString(),
  upstream: "test-upstream",
  upstreamKind: "http",
  surfaces: ["openapi"],
};

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function listen(
  app: ReturnType<typeof createMcpApiAdapterApp> | import("express").Express
): Promise<{
  server: Server;
  base: string;
}> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return { server, base: `http://127.0.0.1:${port}` };
}

describe("mcp-api-adapter ClawQL MCP JWT / JWKS enforcement", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    while (servers.length) {
      const s = servers.pop();
      if (s) await closeHttpServer(s);
    }
  });

  it("accepts issuer-minted bearer via JWKS and rejects untrusted / expired / unsigned", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const signing = await Effect.runPromise(
      loadMcpOAuthSigningMaterialEffect({
        privateKeyPem: await exportPKCS8(privateKey),
        keyId: "adapter-it",
      })
    );

    const issuer = "https://auth.clawql.test";
    const salt = "aabbccddee";
    const clientSecret = "client-secret-value";
    const runtime = await Effect.runPromise(
      createMcpOAuthForTests({
        issuer,
        signing,
        clients: [
          {
            clientId: "cline-agent",
            salt,
            clientSecretHash: hashMcpClientSecret(salt, clientSecret),
            defaultScope: ["execute", "search"],
            defaultRole: "operator",
            orgId: "acme",
          },
        ],
      })
    );

    // Publish the same JWKS the AS would serve at /.well-known/jwks.json
    const jwksApp = (await import("express")).default();
    jwksApp.get("/.well-known/jwks.json", (_req, res) => {
      res.json(runtime.server.getJwks());
    });
    const jwksListen = await listen(jwksApp);
    servers.push(jwksListen.server);

    const jwksUrl = `${jwksListen.base}/.well-known/jwks.json`;
    // Same shape CLI derives from MCP_API_ADAPTER_JWKS_URL + MCP_API_ADAPTER_JWT_ISSUER
    const adapterApp = createMcpApiAdapterApp({
      getCatalog: () => emptyCatalog,
      callTool: async () => ({ text: "", content: [], isError: false }),
      jwtAuth: { jwksUrl, issuer },
    });
    const adapter = await listen(adapterApp);
    servers.push(adapter.server);

    // Guard: without a credential the adapter must 401 (not silently forward)
    const noAuth = await fetch(`${adapter.base}/tools`);
    expect(noAuth.status).toBe(401);

    const minted = await Effect.runPromise(
      runtime.server.issueToken({
        grantType: "client_credentials",
        clientId: "cline-agent",
        clientSecret,
      })
    );

    const ok = await fetch(`${adapter.base}/tools`, {
      headers: { Authorization: `Bearer ${minted.access_token}` },
    });
    expect(ok.status).toBe(200);

    // Untrusted key (valid JWT shape, wrong signer) must be rejected
    const { privateKey: attackerKey } = await generateKeyPair("RS256", { extractable: true });
    const forged = await new SignJWT({
      atr: { sub: "attacker", role: "admin", scope: ["*"] },
    })
      .setProtectedHeader({ alg: "RS256", kid: "adapter-it" })
      .setSubject("attacker")
      .setIssuer(issuer)
      .setExpirationTime("5m")
      .sign(attackerKey);

    const forgedRes = await fetch(`${adapter.base}/tools`, {
      headers: { Authorization: `Bearer ${forged}` },
    });
    expect(forgedRes.status).toBe(401);

    // Expired token signed by the real issuer must be rejected
    const expired = await new SignJWT({
      atr: { sub: "alice", role: "operator", scope: ["execute"] },
    })
      .setProtectedHeader({ alg: "RS256", kid: "adapter-it" })
      .setSubject("alice")
      .setIssuer(issuer)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(signing.signKey);

    const expiredRes = await fetch(`${adapter.base}/tools`, {
      headers: { Authorization: `Bearer ${expired}` },
    });
    expect(expiredRes.status).toBe(401);

    // Missing atr claim (even if signature would otherwise verify) — mint raw JWT without atr
    const noAtr = await new SignJWT({ scope: "execute" })
      .setProtectedHeader({ alg: "RS256", kid: "adapter-it" })
      .setSubject("alice")
      .setIssuer(issuer)
      .setExpirationTime("5m")
      .sign(signing.signKey);

    const noAtrRes = await fetch(`${adapter.base}/tools`, {
      headers: { Authorization: `Bearer ${noAtr}` },
    });
    expect(noAtrRes.status).toBe(401);

    // healthz stays open
    const health = await fetch(`${adapter.base}/healthz`);
    expect(health.status).toBe(200);
  });
});
