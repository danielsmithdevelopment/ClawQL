#!/usr/bin/env node
/**
 * Tiny GET /pets upstream for CoreToolsDO execute smoke.
 */
import { createServer } from "node:http";

const port = Number(process.env.MOCK_PETS_PORT || process.argv[2] || 9893);

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  if (req.method === "GET" && url.pathname === "/pets") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ pets: [{ id: 1, name: "celld-core" }] }));
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
