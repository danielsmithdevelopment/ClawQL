import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { SignJWT } from "jose";
import {
  createBridgeJwtExpressMiddleware,
  isBridgeJwtGateEnabled,
  verifyBridgeJwtAuthorizationHeader,
} from "./jwt-gate.js";

describe("jwt-gate", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.CLAWQL_MCP_JWT_ENABLED;
    delete process.env.CLAWQL_MCP_JWT_HS256_SECRET;
    delete process.env.CLAWQL_MCP_JWT_JWKS_URL;
    delete process.env.CLAWQL_MCP_JWT_PUBLIC_KEY_PEM_PATH;
    delete process.env.CLAWQL_MCP_JWT_ISSUER;
    delete process.env.CLAWQL_MCP_JWT_AUDIENCE;
    delete process.env.CLAWQL_MCP_JWT_ATR_CLAIM;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("is disabled by default", () => {
    expect(isBridgeJwtGateEnabled()).toBe(false);
    expect(createBridgeJwtExpressMiddleware()).toBeNull();
  });

  it("verifyBridgeJwtAuthorizationHeader accepts HS256 token with atr claim", async () => {
    process.env.CLAWQL_MCP_JWT_ENABLED = "1";
    process.env.CLAWQL_MCP_JWT_HS256_SECRET = "unit-test-secret";
    const secret = new TextEncoder().encode("unit-test-secret");
    const token = await new SignJWT({ atr: { task: "t1" } })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .sign(secret);
    await expect(verifyBridgeJwtAuthorizationHeader(`Bearer ${token}`)).resolves.toBeUndefined();
  });

  it("rejects token without atr claim", async () => {
    process.env.CLAWQL_MCP_JWT_ENABLED = "1";
    process.env.CLAWQL_MCP_JWT_HS256_SECRET = "unit-test-secret";
    const secret = new TextEncoder().encode("unit-test-secret");
    const token = await new SignJWT({ sub: "nope" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .sign(secret);
    await expect(verifyBridgeJwtAuthorizationHeader(`Bearer ${token}`)).rejects.toThrow(/atr/i);
  });

  it("express middleware returns 401 JSON-RPC when token missing", async () => {
    process.env.CLAWQL_MCP_JWT_ENABLED = "1";
    process.env.CLAWQL_MCP_JWT_HS256_SECRET = "unit-test-secret";
    const mw = createBridgeJwtExpressMiddleware();
    expect(mw).not.toBeNull();

    const app = express();
    app.post("/mcp", mw!, (_req, res) => res.status(200).send("ok"));
    const server = createServer(app);
    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.on("error", reject);
    });
    const addr = server.address();
    const port = typeof addr === "object" && addr && "port" in addr ? addr.port : 0;
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST", headers: {} });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/Unauthorized/i);
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });
});
