#!/usr/bin/env node
/**
 * Unit checks for adapter-fetch (no celld required).
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { callAdapterTool } from "../src/adapter-fetch.js";

async function testDeferredWhenUnset() {
  const out = await callAdapterTool({ url: "" }, "search", { query: "x" });
  assert.equal(out.deferred, true);
  assert.equal(out.ok, false);
}

async function testCallAdapterTool() {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      assert.equal(req.method, "POST");
      assert.equal(req.url, "/search");
      const parsed = JSON.parse(body);
      assert.equal(parsed.query, "hello");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, source: "unit", query: parsed.query }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const out = await callAdapterTool(
    { url: `http://127.0.0.1:${port}` },
    "search",
    { query: "hello", limit: 1 }
  );
  assert.equal(out.ok, true);
  assert.equal(out.transport, "mcp-api-adapter-rest");
  assert.equal(out.parsed?.query, "hello");
  server.close();
  await once(server, "close");
}

await testDeferredWhenUnset();
await testCallAdapterTool();
console.log("adapter-fetch.test: PASS");
