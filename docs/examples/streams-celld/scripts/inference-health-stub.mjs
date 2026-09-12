#!/usr/bin/env node
/**
 * Tiny inference /healthz stub for Lab 5b full-stack smoke.
 * Real completions stay on clawql-inference; cells only probe health today.
 */
import { createServer } from "node:http";

const port = Number(process.env.INFERENCE_STUB_PORT || process.argv[2] || 19082);

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  if (req.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/health")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        source: "streams-celld-inference-stub",
        transport: "http",
      })
    );
    return;
  }
  res.writeHead(404).end("not found");
});

server.listen(port, "127.0.0.1", () => {
  console.error(`inference-stub: http://127.0.0.1:${port}/healthz`);
});
