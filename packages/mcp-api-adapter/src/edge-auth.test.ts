import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { createJwtVerifier, verifyEdgeCredential } from "./edge-auth.js";
import { createMcpApiAdapterApp } from "./server.js";
import type { ToolCatalog } from "./types.js";

const emptyCatalog: ToolCatalog = {
  tools: [],
  fetchedAt: new Date().toISOString(),
  upstream: "test",
  upstreamKind: "http",
  surfaces: ["openapi"],
};

describe("mcp-api-adapter edge auth", () => {
  const secret = "test-mcp-adapter-hs256-secret-32chars!";
  const issuer = "https://auth.clawql.test";

  it("accepts static api key or HS256 MCP JWT with atr claim", async () => {
    const verifyJwt = createJwtVerifier({ hs256Secret: secret, issuer });
    expect(verifyJwt).toBeTruthy();

    expect(
      await verifyEdgeCredential("static-key", { apiKey: "static-key", jwt: { hs256Secret: secret } }, verifyJwt)
    ).toBe(true);

    const jwt = await new SignJWT({
      atr: { sub: "alice", role: "operator", scope: ["execute"] },
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("alice")
      .setIssuer(issuer)
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(secret));

    expect(
      await verifyEdgeCredential(jwt, { apiKey: "static-key", jwt: { hs256Secret: secret, issuer } }, verifyJwt)
    ).toBe(true);

    expect(
      await verifyEdgeCredential("wrong", { apiKey: "static-key", jwt: { hs256Secret: secret, issuer } }, verifyJwt)
    ).toBe(false);
  });

  it("HTTP middleware accepts Bearer MCP JWT when jwtAuth configured", async () => {
    const app = createMcpApiAdapterApp({
      getCatalog: () => emptyCatalog,
      callTool: async () => ({
        text: "",
        content: [],
        isError: false,
      }),
      apiKey: "static-key",
      jwtAuth: { hs256Secret: secret, issuer },
    });
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    try {
      const denied = await fetch(`http://127.0.0.1:${port}/tools`);
      expect(denied.status).toBe(401);

      const withKey = await fetch(`http://127.0.0.1:${port}/tools`, {
        headers: { "x-api-key": "static-key" },
      });
      expect(withKey.status).toBe(200);

      const jwt = await new SignJWT({
        atr: { sub: "alice", role: "operator", scope: ["execute"] },
      })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("alice")
        .setIssuer(issuer)
        .setExpirationTime("5m")
        .sign(new TextEncoder().encode(secret));

      const withJwt = await fetch(`http://127.0.0.1:${port}/tools`, {
        headers: { authorization: `Bearer ${jwt}` },
      });
      expect(withJwt.status).toBe(200);

      const expired = await new SignJWT({
        atr: { sub: "alice", role: "operator", scope: ["execute"] },
      })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("alice")
        .setIssuer(issuer)
        .setIssuedAt(Math.floor(Date.now() / 1000) - 600)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 30)
        .sign(new TextEncoder().encode(secret));

      const expiredRes = await fetch(`http://127.0.0.1:${port}/tools`, {
        headers: { authorization: `Bearer ${expired}` },
      });
      expect(expiredRes.status).toBe(401);

      const wrongKey = await new SignJWT({
        atr: { sub: "alice", role: "operator", scope: ["execute"] },
      })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("alice")
        .setIssuer(issuer)
        .setExpirationTime("5m")
        .sign(new TextEncoder().encode("different-hs256-secret-not-trusted!!"));

      const wrongRes = await fetch(`http://127.0.0.1:${port}/tools`, {
        headers: { authorization: `Bearer ${wrongKey}` },
      });
      expect(wrongRes.status).toBe(401);

      const health = await fetch(`http://127.0.0.1:${port}/healthz`);
      expect(health.status).toBe(200);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
});
