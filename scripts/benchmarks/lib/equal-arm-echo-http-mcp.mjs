#!/usr/bin/env node
/**
 * Do-nothing echo tool over the **same HTTP stack shape** as ClawQL bench:
 * Express + express.json + MCP StreamableHTTPServerTransport (sessionful,
 * enableJsonResponse, standalone GET SSE disabled).
 *
 * Used to bisect rare HTTP p999 spikes: if this spikes like clawql_http, the
 * stack is the cause; if not, ClawQL per-request logic is.
 *
 * Env:
 *   PORT / MCP_PORT (default 0 = ephemeral)
 *   CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE (default 1)
 *   CLAWQL_MCP_DISABLE_STANDALONE_SSE (default 1)
 *   CLAWQL_MCP_JSON_BODY_LIMIT (default 2mb)
 *   ECHO_WORK_MS — optional artificial delay inside the tool (default 0)
 *
 * stdout: {"ready":true,"mcpUrl":"http://127.0.0.1:PORT/mcp","pid":N}
 */
import { randomUUID } from "node:crypto";
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const PORT = Number(process.env.MCP_PORT || process.env.PORT || 0) || 0;
const JSON_LIMIT = (process.env.CLAWQL_MCP_JSON_BODY_LIMIT || "2mb").trim() || "2mb";
const ENABLE_JSON = !["0", "false", "no"].includes(
  (process.env.CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE ?? "1").trim().toLowerCase()
);
const DISABLE_SSE = !["0", "false", "no"].includes(
  (process.env.CLAWQL_MCP_DISABLE_STANDALONE_SSE ?? "1").trim().toLowerCase()
);
const WORK_MS = Math.max(0, Number(process.env.ECHO_WORK_MS || 0) || 0);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function createEchoServer() {
  const server = new Server(
    { name: "equal-arm-echo-http", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "echo",
        description: "Do-nothing echo for HTTP stack bisect. Returns the input message.",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string", description: "Payload to echo" },
          },
          additionalProperties: false,
        },
      },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== "echo") {
      return {
        isError: true,
        content: [{ type: "text", text: `unknown tool ${req.params.name}` }],
      };
    }
    if (WORK_MS > 0) await sleep(WORK_MS);
    const message = req.params.arguments?.message ?? "ok";
    return {
      content: [{ type: "text", text: JSON.stringify({ echo: message, t: Date.now() }) }],
    };
  });
  return server;
}

function isInitializeRequest(body) {
  return (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    body.method === "initialize"
  );
}

const transports = new Map();
const app = express();
app.use(express.json({ limit: JSON_LIMIT }));

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true, pid: process.pid });
});

app.post("/mcp", async (req, res) => {
  const sessionId = req.header("mcp-session-id");
  try {
    let transport;
    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId);
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports.set(sid, transport);
        },
        enableJsonResponse: ENABLE_JSON,
      });
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) transports.delete(sid);
      };
      const server = createEchoServer();
      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: missing/invalid mcp-session-id or initialize required",
        },
        id: null,
      });
      return;
    }
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[echo-http] POST /mcp error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: err instanceof Error ? err.message : "Internal error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (req, res) => {
  if (DISABLE_SSE) {
    res.status(405).set("Allow", "POST").send("Method Not Allowed");
    return;
  }
  const sessionId = req.header("mcp-session-id");
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) {
    res.status(400).send("Invalid or missing mcp-session-id");
    return;
  }
  await transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.header("mcp-session-id");
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (transport) {
    await transport.handleRequest(req, res).catch(() => undefined);
    transports.delete(sessionId);
  } else {
    res.status(200).end();
  }
});

const server = app.listen(PORT, "127.0.0.1", () => {
  const port = server.address().port;
  const mcpUrl = `http://127.0.0.1:${port}/mcp`;
  process.stdout.write(
    JSON.stringify({
      ready: true,
      mcpUrl,
      pid: process.pid,
      enableJsonResponse: ENABLE_JSON,
      disableStandaloneSse: DISABLE_SSE,
    }) + "\n"
  );
  console.error(`[echo-http] listening on ${mcpUrl} pid=${process.pid}`);
});

function shutdown() {
  for (const t of transports.values()) {
    try {
      t.close?.();
    } catch {
      /* ignore */
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
