#!/usr/bin/env node
/**
 * Unit checks for worm-fetch (no celld required).
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  appendWormEntry,
  queryWormEntries,
  requireComplianceWorm,
} from "../src/worm-fetch.js";

async function testDeferredWhenUnset() {
  const out = await appendWormEntry({ url: "" }, {
    type: "SESSION_START",
    sessionId: "s",
  });
  assert.equal(out.deferred, true);
  assert.equal(out.ok, false);
  const gate = requireComplianceWorm({ url: "" }, out);
  assert.equal(gate.ok, true);
  assert.equal(gate.deferred, true);
}

async function testFailClosedWhenUrlSetAndAppendFails() {
  const gate = requireComplianceWorm(
    { url: "http://127.0.0.1:9" },
    { ok: false, error: "fetch failed", transport: "clawql-audit-http" }
  );
  assert.equal(gate.ok, false);
  assert.match(String(gate.error), /fail|unreachable|refusing|failed/i);
}

async function testFetchUnreachableDoesNotOk() {
  const out = await appendWormEntry(
    { url: "http://127.0.0.1:1", timeoutMs: 500 },
    { type: "SESSION_START", sessionId: "unreachable" }
  );
  assert.equal(out.ok, false);
  assert.equal(out.deferred, undefined);
  assert.ok(out.error);
  const gate = requireComplianceWorm({ url: "http://127.0.0.1:1" }, out);
  assert.equal(gate.ok, false);
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
      const prev =
        store.length === 0
          ? { hash: "0".repeat(64), chainIndex: -1 }
          : /** @type {{ hash: string, chainIndex: number }} */ (store[store.length - 1]);
      const entry = {
        id: `e${store.length}`,
        hash: String(store.length).padStart(64, "a"),
        prevHash: prev.hash,
        chainIndex: prev.chainIndex + 1,
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
      const sessionId = url.searchParams.get("sessionId");
      const filtered = sessionId
        ? store.filter((e) => /** @type {{ sessionId?: string }} */ (e).sessionId === sessionId)
        : store;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ entries: filtered, total: filtered.length }));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const cfg = { url: `http://127.0.0.1:${port}`, apiKey: "test-key" };

  const tip = await appendWormEntry(cfg, {
    type: "AGENT_ACTION",
    sessionId: "seed",
    metadata: { kind: "tip_seed" },
  });
  assert.equal(tip.ok, true);
  assert.equal(tip.chainIndex, 0);

  const appended = await appendWormEntry(cfg, {
    type: "SESSION_START",
    sessionId: "sess-1",
    virtualKeyId: "vk_1",
    metadata: { source: "unit" },
  });
  assert.equal(appended.ok, true);
  assert.equal(appended.chainIndex, 1);
  assert.equal(
    /** @type {{ entry?: { prevHash?: string } }} */ (appended).entry?.prevHash,
    tip.hash
  );
  const gate = requireComplianceWorm(cfg, appended);
  assert.equal(gate.ok, true);

  const listed = await queryWormEntries(cfg, { sessionId: "sess-1" });
  assert.equal(listed.ok, true);
  assert.equal(listed.entries?.length, 1);
  assert.equal(listed.entries?.[0]?.prevHash, tip.hash);
  server.close();
  await once(server, "close");
}

await testDeferredWhenUnset();
await testFailClosedWhenUrlSetAndAppendFails();
await testFetchUnreachableDoesNotOk();
await testAppendAndQuery();
console.log("worm-fetch.test: PASS");
