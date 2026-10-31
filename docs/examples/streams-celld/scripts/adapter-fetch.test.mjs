#!/usr/bin/env node
/**
 * Unit checks for adapter-fetch (no celld required).
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { callAdapterTool, isTransientAdapterFailure } from "../src/adapter-fetch.js";

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
  const out = await callAdapterTool({ url: `http://127.0.0.1:${port}` }, "search", {
    query: "hello",
    limit: 1,
  });
  assert.equal(out.ok, true);
  assert.equal(out.transport, "mcp-api-adapter-rest");
  assert.equal(out.parsed?.query, "hello");
  server.close();
  await once(server, "close");
}

async function testRetriesTransient502() {
  let hits = 0;
  const server = createServer((_req, res) => {
    hits += 1;
    if (hits < 3) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "upstream CallTool failed",
          message: "fetch failed",
          result: { content: [{ type: "text", text: "fetch failed" }], isError: true },
        })
      );
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, recovered: true }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const out = await callAdapterTool({ url: `http://127.0.0.1:${port}`, retries: 3 }, "search", {
    query: "retry",
  });
  assert.equal(out.ok, true);
  assert.equal(out.parsed?.recovered, true);
  assert.ok(hits >= 3);
  server.close();
  await once(server, "close");
}

assert.equal(
  isTransientAdapterFailure({
    ok: false,
    status: 502,
    error: "upstream CallTool failed",
    parsed: { message: "fetch failed" },
  }),
  true
);
assert.equal(isTransientAdapterFailure({ ok: true }), false);
assert.equal(isTransientAdapterFailure({ ok: false, status: 400, error: "bad request" }), false);

await testDeferredWhenUnset();
await testCallAdapterTool();
await testRetriesTransient502();
console.log("adapter-fetch.test: PASS");
