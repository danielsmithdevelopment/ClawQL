/**
 * Upstream MCP sanity runs in-process. Full bridge ↔ stdio shim chain runs via a plain Node subprocess
 * (`scripts/e2e-direct-shim.mjs`): Vitest's worker + nested stdio MCP reliably deadlocks (#293).
 *
 * Requires `dist/shim-main.js`; run `npm run build -w panguard-mcp-bridge` before tests (CI does this).
 */

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Response } from "express";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const shimDistPath = join(here, "..", "dist", "shim-main.js");
const e2eScriptPath = join(here, "..", "scripts", "e2e-direct-shim.mjs");
const repoRoot = join(here, "..", "..", "..");

function jsonRpcError(res: Response, message: string): void {
  res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });
}

async function startMinimalUpstream(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const mcpPath = "/mcp";
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const app = express();
  app.use(express.json());

  app.post(mcpPath, async (req, res) => {
    const sessionId = req.header("mcp-session-id");
    try {
      let transport: StreamableHTTPServerTransport | undefined;
      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        const mcp = new McpServer({ name: "upstream-int", version: "1.0.0" }, {});
        mcp.tool("e2e_bridge_ping", "ping", () => "pong");
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport!);
          },
          enableJsonResponse: true,
        });
        transport.onclose = () => {
          const sid = transport?.sessionId;
          if (sid) transports.delete(sid);
        };
        await mcp.connect(transport);
      } else {
        jsonRpcError(res, "Bad Request: missing session or initialize.");
        return;
      }
      if (!transport) {
        jsonRpcError(res, "Bad Request: transport could not be resolved.");
        return;
      }
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) {
        res.status(500).end();
      }
    }
  });

  app.get(mcpPath, async (req, res) => {
    const sid = req.header("mcp-session-id");
    if (!sid) {
      jsonRpcError(res, "Bad Request: missing mcp-session-id.");
      return;
    }
    const st = transports.get(sid);
    if (!st) {
      jsonRpcError(res, "Bad Request: invalid mcp-session-id.");
      return;
    }
    await st.handleRequest(req, res);
  });

  app.delete(mcpPath, async (req, res) => {
    const sid = req.header("mcp-session-id");
    if (!sid) {
      jsonRpcError(res, "Bad Request: missing mcp-session-id.");
      return;
    }
    const st = transports.get(sid);
    if (!st) {
      jsonRpcError(res, "Bad Request: invalid mcp-session-id.");
      return;
    }
    await st.handleRequest(req, res);
  });

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr && "port" in addr ? addr.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}${mcpPath}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe("panguard bridge integration (direct shim)", () => {
  const saved = { ...process.env };

  beforeAll(() => {
    if (!existsSync(shimDistPath)) {
      throw new Error(`Missing ${shimDistPath}; run: npm run build -w panguard-mcp-bridge`);
    }
    if (!existsSync(e2eScriptPath)) {
      throw new Error(`Missing ${e2eScriptPath}`);
    }
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("minimal upstream accepts Streamable HTTP client (sanity)", async () => {
    const upstream = await startMinimalUpstream();
    const transport = new StreamableHTTPClientTransport(new URL(upstream.baseUrl));
    const client = new Client({ name: "upstream-sanity", version: "1.0.0" }, {});
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain("e2e_bridge_ping");
    } finally {
      await client.close();
      await upstream.close();
    }
  }, 20_000);

  it("HTTP + direct shim + listTools (plain Node subprocess)", () => {
    const r = spawnSync(process.execPath, [e2eScriptPath], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 90_000,
      env: { ...process.env },
    });
    if (r.status !== 0) {
      process.stderr.write(`${r.stdout}\n${r.stderr}\n`);
    }
    expect(r.status, "e2e-direct-shim.mjs must exit 0").toBe(0);
    expect(r.stderr).toMatch(/e2e_bridge_ping/);
  }, 95_000);
});
