import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { createMcpApiAdapterApp } from "./server.js";
import type { ListedMcpTool, ToolCatalog } from "./types.js";

const catalogTools: ListedMcpTool[] = [
  { name: "search", description: "Search ops", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "execute", description: "Execute op", inputSchema: { type: "object", properties: {} } },
  { name: "memory_recall", description: "Recall", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "pageindex_build_tree", description: "Internal", inputSchema: { type: "object", properties: {} } },
  { name: "ouroboros_run_evolutionary_loop", description: "Internal", inputSchema: { type: "object", properties: {} } },
];

function catalog(): ToolCatalog {
  return {
    tools: catalogTools,
    fetchedAt: new Date().toISOString(),
    upstream: "test",
    upstreamKind: "http",
    surfaces: ["openapi", "mcp-ui"],
    mcpUiPath: "/mcp-ui",
  };
}

describe("mcp-ui ATR scoping", () => {
  const secret = "test-mcp-ui-atr-hs256-secret-32chars!!";
  const issuer = "https://auth.clawql.test";
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeServer?.();
    closeServer = undefined;
  });

  async function mintJwt(atr: Record<string, unknown>): Promise<string> {
    return new SignJWT({ atr })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(atr.sub ?? "user"))
      .setIssuer(issuer)
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(secret));
  }

  async function startApp(atrScoped = true): Promise<string> {
    const app = createMcpApiAdapterApp({
      getCatalog: catalog,
      callTool: async () => ({ text: "{}", content: [], isError: false }),
      jwtAuth: { hs256Secret: secret, issuer },
      mcpUiPath: "/mcp-ui",
      mcpUiAtrScoped: atrScoped,
      title: "ATR scope test",
    });
    const server = app.listen(0, "127.0.0.1");
    closeServer = () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    await new Promise<void>((resolve, reject) => {
      server.once("listening", () => resolve());
      server.once("error", reject);
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    return `http://127.0.0.1:${addr.port}`;
  }

  it("two ATR scopes see different /mcp-ui tool cards", async () => {
    const base = await startApp(true);

    const memoryJwt = await mintJwt({
      sub: "memory-user",
      role: "operator",
      scope: ["search", "memory"],
    });
    const execJwt = await mintJwt({
      sub: "exec-user",
      role: "operator",
      scope: ["execute", "audit"],
    });

    const memoryPage = await fetch(`${base}/mcp-ui`, {
      headers: { authorization: `Bearer ${memoryJwt}` },
    });
    expect(memoryPage.status).toBe(200);
    const memoryHtml = await memoryPage.text();
    expect(memoryHtml).toContain('id="tool-search"');
    expect(memoryHtml).toContain('id="tool-memory_recall"');
    expect(memoryHtml).not.toContain('id="tool-execute"');
    expect(memoryHtml).not.toContain("pageindex_build_tree");
    expect(memoryHtml).not.toContain("ouroboros_run_evolutionary_loop");

    const execPage = await fetch(`${base}/mcp-ui`, {
      headers: { authorization: `Bearer ${execJwt}` },
    });
    expect(execPage.status).toBe(200);
    const execHtml = await execPage.text();
    expect(execHtml).toContain('id="tool-execute"');
    expect(execHtml).not.toContain('id="tool-search"');
    expect(execHtml).not.toContain('id="tool-memory_recall"');
    expect(execHtml).not.toContain("pageindex_build_tree");
    expect(execHtml).not.toContain("ouroboros_run_evolutionary_loop");
  });

  it("forbids execute of tools outside ATR even if known in catalog", async () => {
    const base = await startApp(true);
    const jwt = await mintJwt({
      sub: "memory-user",
      scope: ["memory"],
    });

    const denied = await fetch(`${base}/mcp-ui/execute/execute`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${jwt}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "",
    });
    expect(denied.status).toBe(403);
    expect(await denied.text()).toContain("outside your ATR scope");

    const allowed = await fetch(`${base}/mcp-ui/execute/memory_recall`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${jwt}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ query: "hello" }).toString(),
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toContain("result--success");
  });
});
