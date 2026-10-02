import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { createPanguardBridgeApp } from "./gateway-main.js";

async function listen(
  app: ReturnType<Awaited<ReturnType<typeof createPanguardBridgeApp>>>
): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const server = createServer(app);
  await new Promise<void>((resolveListen, rejectListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen());
    server.on("error", rejectListen);
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr && "port" in addr ? addr.port : 0;
  return {
    port,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => (err ? rejectClose(err) : resolveClose()));
      }),
  };
}

describe("createPanguardBridgeApp", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.CLAWQL_MCP_JWT_ENABLED;
    delete process.env.CLAWQL_MCP_JWT_HS256_SECRET;
    delete process.env.CLAWQL_MCP_JWT_JWKS_URL;
    delete process.env.CLAWQL_MCP_JWT_PUBLIC_KEY_PEM_PATH;
    delete process.env.CLAWQL_MCP_JWT_ISSUER;
    delete process.env.CLAWQL_MCP_JWT_AUDIENCE;
    delete process.env.CLAWQL_MCP_JWT_ATR_CLAIM;
    delete process.env.CLAWQL_BRIDGE_DIRECT_SHIM;
    delete process.env.MCP_PATH;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("serves GET /healthz", async () => {
    const app = await createPanguardBridgeApp({
      upstreamUrl: "http://127.0.0.1:65530/mcp",
      shimPath: "/nonexistent/shim.js",
    });
    const { port, close } = await listen(app);
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.ok).toBe(true);
    expect(await res.text()).toBe("ok");
    await close();
  });

  it("returns 400 JSON-RPC when POST /mcp lacks session and is not initialize", async () => {
    const app = await createPanguardBridgeApp({
      upstreamUrl: "http://127.0.0.1:65530/mcp",
      shimPath: "/nonexistent/shim.js",
    });
    const { port, close } = await listen(app);
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/mcp-session-id|initialize/i);
    await close();
  });

  it("returns 400 JSON-RPC when GET /mcp lacks mcp-session-id", async () => {
    const app = await createPanguardBridgeApp({
      upstreamUrl: "http://127.0.0.1:65530/mcp",
      shimPath: "/nonexistent/shim.js",
    });
    const { port, close } = await listen(app);
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, { method: "GET" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/mcp-session-id/i);
    await close();
  });

  it("returns 400 JSON-RPC when DELETE /mcp has an unknown session id", async () => {
    const app = await createPanguardBridgeApp({
      upstreamUrl: "http://127.0.0.1:65530/mcp",
      shimPath: "/nonexistent/shim.js",
    });
    const { port, close } = await listen(app);
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "DELETE",
      headers: { "mcp-session-id": "does-not-exist" },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/invalid mcp-session-id/i);
    await close();
  });

  it("JWT gate returns 401 on /mcp while /healthz stays open", async () => {
    process.env.CLAWQL_MCP_JWT_ENABLED = "1";
    process.env.CLAWQL_MCP_JWT_HS256_SECRET = "unit-test-secret";
    const app = await createPanguardBridgeApp({
      upstreamUrl: "http://127.0.0.1:65530/mcp",
      shimPath: "/nonexistent/shim.js",
    });
    const { port, close } = await listen(app);

    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(health.ok).toBe(true);

    const denied = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(denied.status).toBe(401);
    const deniedBody = (await denied.json()) as { error?: { message?: string } };
    expect(deniedBody.error?.message).toMatch(/Unauthorized/i);
    await close();
  });

  it("JWT gate allows a valid Bearer token through to session validation", async () => {
    process.env.CLAWQL_MCP_JWT_ENABLED = "1";
    process.env.CLAWQL_MCP_JWT_HS256_SECRET = "unit-test-secret";
    const secret = new TextEncoder().encode("unit-test-secret");
    const token = await new SignJWT({ atr: { task: "gateway-test" } })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .sign(secret);

    const app = await createPanguardBridgeApp({
      upstreamUrl: "http://127.0.0.1:65530/mcp",
      shimPath: "/nonexistent/shim.js",
    });
    const { port, close } = await listen(app);
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/mcp-session-id|initialize/i);
    await close();
  });

  it("returns 502 when initialize cannot attach shim/upstream", async () => {
    process.env.CLAWQL_BRIDGE_DIRECT_SHIM = "1";
    const app = await createPanguardBridgeApp({
      upstreamUrl: "http://127.0.0.1:65530/mcp",
      shimPath: "/nonexistent/shim-does-not-exist.js",
    });
    const { port, close } = await listen(app);
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "gateway-unit", version: "0.0.0" },
        },
      }),
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error?: { message?: string } };
    expect(body.error?.message).toBeTruthy();
    await close();
  });
});
