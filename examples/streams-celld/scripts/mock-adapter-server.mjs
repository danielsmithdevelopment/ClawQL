#!/usr/bin/env node
/**
 * Minimal mcp-api-adapter REST stub for Lab 5b smoke (POST /{tool}).
 */
import { createServer } from "node:http";

const port = Number(process.env.MOCK_ADAPTER_PORT || process.argv[2] || 9892);
const tools = new Set(["search", "execute", "memory_ingest", "memory_recall"]);

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  if (req.method === "GET" && url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, transport: "mock-adapter", toolCount: tools.size }));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(404).end("not found");
    return;
  }

  const name = url.pathname.replace(/^\//, "");
  if (!tools.has(name)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `unknown tool: ${name}` }));
    return;
  }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  let args = {};
  try {
    args = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    res.writeHead(400).end("bad json");
    return;
  }

  let payload;
  if (name === "search") {
    payload = {
      ok: true,
      source: "mock-adapter",
      query: args.query,
      results: [{ operationId: "streams.session.noop", score: 1 }],
    };
  } else if (name === "execute") {
    payload = {
      ok: true,
      source: "mock-adapter",
      operationId: args.operationId,
      result: { status: "noop" },
    };
  } else if (name === "memory_ingest") {
    payload = {
      ok: true,
      source: "mock-adapter",
      path: `Memory/${String(args.title || "note").replace(/\s+/g, "-").toLowerCase()}.md`,
      title: args.title,
    };
  } else {
    payload = {
      ok: true,
      source: "mock-adapter",
      query: args.query,
      results: [{ path: "Memory/streams-celld-session.md", score: 1, snippet: "adapter recall" }],
    };
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock-adapter: http://127.0.0.1:${port}`);
});
