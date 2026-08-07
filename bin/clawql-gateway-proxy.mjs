#!/usr/bin/env node
/**
 * Lightweight Managed Edge Gateway proxy (process profile).
 * Routes:
 *   /mcp*  → MCP_UPSTREAM (default http://127.0.0.1:18080)
 *   /v1*   → INFERENCE_UPSTREAM (default http://127.0.0.1:18081)
 *   /healthz → local JSON
 *
 * Canonical copy for npm installs (`clawql-gateway-proxy`) and Packer/process profile.
 * examples/managed-gateway/gateway-proxy.mjs stays in sync for local checkout demos.
 */
import http from "node:http";
import { URL } from "node:url";

const listenPort = Number.parseInt(process.env.CLAWQL_GATEWAY_PORT || "8080", 10);
const listenHost = process.env.CLAWQL_GATEWAY_HOST || "127.0.0.1";
const mcpUpstream = (process.env.CLAWQL_MCP_UPSTREAM || "http://127.0.0.1:18080").replace(
  /\/$/,
  ""
);
const inferenceUpstream = (
  process.env.CLAWQL_INFERENCE_UPSTREAM || "http://127.0.0.1:18081"
).replace(/\/$/, "");

function proxy(req, res, targetBase) {
  const incoming = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const target = new URL(incoming.pathname + incoming.search, targetBase + "/");
  const headers = { ...req.headers, host: target.host };
  delete headers["content-length"];

  const upstream = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: target.pathname + target.search,
      method: req.method,
      headers,
    },
    (upRes) => {
      res.writeHead(upRes.statusCode || 502, upRes.headers);
      upRes.pipe(res);
    }
  );
  upstream.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
    }
    res.end(JSON.stringify({ error: "bad_gateway", message: String(err.message || err) }));
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const path = req.url?.split("?")[0] || "/";
  if (path === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        gateway: "managed-edge",
        mcp: "/mcp",
        inference: "/v1",
      })
    );
    return;
  }
  if (path === "/mcp" || path.startsWith("/mcp/")) {
    proxy(req, res, mcpUpstream);
    return;
  }
  if (path === "/v1" || path.startsWith("/v1/")) {
    proxy(req, res, inferenceUpstream);
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found", hint: "Use /mcp, /v1, or /healthz" }));
});

server.listen(listenPort, listenHost, () => {
  console.log(
    `clawql managed-gateway proxy on http://${listenHost}:${listenPort} (mcp→${mcpUpstream}, v1→${inferenceUpstream})`
  );
});
