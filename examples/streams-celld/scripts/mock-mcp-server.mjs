#!/usr/bin/env node
/**
 * Minimal Streamable HTTP MCP stub for Lab 5b smoke
 * (search + execute + memory_ingest + memory_recall).
 * Speaks MCP 2026-07-28-style JSON JSON-RPC tools/call — no SDK.
 */
import { createServer } from "node:http";

const port = Number(process.env.MOCK_MCP_PORT || process.argv[2] || 9891);
const path = "/mcp";

/** @type {Map<string, { title: string, insights: string }>} */
const vault = new Map();

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  if (req.method === "GET" && url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, transport: "mock-mcp" }));
    return;
  }
  if (req.method !== "POST" || url.pathname !== path) {
    res.writeHead(404).end("not found");
    return;
  }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    res.writeHead(400).end("bad json");
    return;
  }

  const id = body.id ?? 1;
  if (body.method === "initialize") {
    res.writeHead(200, {
      "content-type": "application/json",
      "mcp-session-id": "mock-session",
    });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2026-07-28",
          capabilities: { tools: {} },
          serverInfo: { name: "streams-celld-mock-mcp", version: "0.0.0" },
        },
      })
    );
    return;
  }

  if (body.method === "tools/call") {
    const name = body.params?.name;
    const args = body.params?.arguments ?? {};
    let payload;
    if (name === "search") {
      payload = {
        ok: true,
        source: "mock-mcp",
        query: args.query,
        results: [
          {
            operationId: "streams.session.noop",
            score: 1,
            summary: "Lab noop for celld smoke",
          },
        ],
      };
    } else if (name === "execute") {
      payload = {
        ok: true,
        source: "mock-mcp",
        operationId: args.operationId,
        args: args.args ?? {},
        result: { status: "noop" },
      };
    } else if (name === "memory_ingest") {
      const title = String(args.title || "untitled");
      const insights = String(args.insights || "");
      vault.set(title, { title, insights });
      payload = {
        ok: true,
        source: "mock-mcp",
        path: `Memory/${title.replace(/\s+/g, "-").toLowerCase()}.md`,
        title,
      };
    } else if (name === "memory_recall") {
      const query = String(args.query || "").toLowerCase();
      const results = [...vault.values()]
        .filter(
          (n) =>
            n.title.toLowerCase().includes(query) ||
            n.insights.toLowerCase().includes(query) ||
            query.includes("streams")
        )
        .slice(0, Number(args.limit) || 5)
        .map((n) => ({
          path: `Memory/${n.title.replace(/\s+/g, "-").toLowerCase()}.md`,
          score: 1,
          snippet: n.insights.slice(0, 120),
        }));
      if (results.length === 0) {
        results.push({
          path: "Memory/streams-celld-session.md",
          score: 0.5,
          snippet: "mock recall hit for streams-celld",
        });
      }
      payload = {
        ok: true,
        source: "mock-mcp",
        query: args.query,
        results,
      };
    } else {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [{ type: "text", text: `unknown tool: ${name}` }],
          },
        })
      );
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(payload) }],
        },
      })
    );
    return;
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${body.method}` },
    })
  );
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock-mcp: http://127.0.0.1:${port}${path}`);
});
