#!/usr/bin/env node
/**
 * Tiny upstream for Lab 5b OpenAPI pack + CoreToolsDO execute smoke:
 * GET /pets and POST /streams/session/noop.
 */
import { createServer } from "node:http";

const port = Number(process.env.MOCK_PETS_PORT || process.argv[2] || 9893);

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  if (req.method === "GET" && url.pathname === "/pets") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ pets: [{ id: 1, name: "celld-core" }] }));
    return;
  }
  if (
    (req.method === "GET" || req.method === "POST") &&
    url.pathname === "/streams/session/noop"
  ) {
    let body = {};
    if (req.method === "POST") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch {
        body = {};
      }
    } else {
      body = Object.fromEntries(url.searchParams.entries());
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: "noop",
        inCell: false,
        host: "mock-pets-upstream",
        args: body,
      })
    );
    return;
  }
  if (req.method === "GET" && url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404).end("not found");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock-pets-upstream listening on http://127.0.0.1:${port}`);
});
