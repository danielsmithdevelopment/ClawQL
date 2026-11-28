#!/usr/bin/env node
/**
 * In-cluster request sink for regulated-kind wire rows (D5).
 * Records every request; GET /_count returns { n }. Never commit secrets here.
 */
import { createServer } from "node:http";

const port = Number.parseInt(process.env.PORT || "8080", 10);
let n = 0;
const recent = [];

createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/_count" || req.url === "/_count/")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ n, recent: recent.slice(-20) }));
    return;
  }
  if (req.method === "POST" && (req.url === "/_reset" || req.url === "/_reset/")) {
    n = 0;
    recent.length = 0;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, n: 0 }));
    return;
  }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    n += 1;
    recent.push({
      method: req.method,
      url: req.url,
      at: new Date().toISOString(),
      bodyLen: Buffer.concat(chunks).length,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, n }));
  });
}).listen(port, "0.0.0.0", () => {
  console.log(`[wire-sink] listening on 0.0.0.0:${port}`);
});
