#!/usr/bin/env node
/**
 * Unit checks for worm-fetch (no celld required).
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { appendWormEntry, queryWormEntries } from "../src/worm-fetch.js";

async function testDeferredWhenUnset() {
  const out = await appendWormEntry({ url: "" }, {
    type: "SESSION_START",
    sessionId: "s",
  });
  assert.equal(out.deferred, true);
  assert.equal(out.ok, false);
}

async function testAppendAndQuery() {
  /** @type {unknown[]} */
  const store = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    assert.equal(req.headers.authorization, "ApiKey test-key");
    if (req.method === "POST" && url.pathname === "/entries") {
      let body = "";
      for await (const c of req) body += c;
      const parsed = JSON.parse(body);
      const entry = {
        id: "e1",
        hash: "a".repeat(64),
        prevHash: "0".repeat(64),
        chainIndex: 0,
        writtenAt: new Date().toISOString(),
        backendAcks: ["memory"],
        ...parsed,
      };
      store.push(entry);
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify(entry));
      return;
    }
    if (req.method === "GET" && url.pathname === "/entries") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ entries: store, total: store.length }));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const cfg = { url: `http://127.0.0.1:${port}`, apiKey: "test-key" };
  const appended = await appendWormEntry(cfg, {
    type: "SESSION_START",
    sessionId: "sess-1",
    virtualKeyId: "vk_1",
    metadata: { source: "unit" },
  });
  assert.equal(appended.ok, true);
  assert.equal(appended.chainIndex, 0);
  const listed = await queryWormEntries(cfg, { sessionId: "sess-1" });
  assert.equal(listed.ok, true);
  assert.equal(listed.entries?.length, 1);
  server.close();
  await once(server, "close");
}

await testDeferredWhenUnset();
await testAppendAndQuery();
console.log("worm-fetch.test: PASS");
