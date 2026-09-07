#!/usr/bin/env node
/**
 * Unit checks for mcp-fetch (no celld required).
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  callMcpTool,
  parseMcpHttpBody,
  unwrapToolsCallResult,
} from "../src/mcp-fetch.js";

function testParseJson() {
  const rpc = parseMcpHttpBody(
    JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [] } }),
    "application/json"
  );
  assert.equal(rpc.id, 1);
}

function testParseSse() {
  const rpc = parseMcpHttpBody(
    'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\\"ok\\":true}"}]}}\n\n',
    "text/event-stream"
  );
  assert.equal(rpc.id, 2);
  const u = unwrapToolsCallResult(rpc);
  assert.equal(u.ok, true);
  assert.deepEqual(u.parsed, { ok: true });
}

async function testCallMcpTool() {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body);
      assert.equal(parsed.method, "tools/call");
      assert.equal(req.headers["mcp-protocol-version"], "2026-07-28");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: parsed.id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({ ok: true, query: parsed.params.arguments.query }),
              },
            ],
          },
        })
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const out = await callMcpTool(
    { url: `http://127.0.0.1:${port}/mcp` },
    "search",
    { query: "hello", limit: 1 }
  );
  assert.equal(out.ok, true);
  assert.equal(out.parsed?.query, "hello");
  assert.equal(out.deferred, undefined);
  server.close();
  await once(server, "close");
}

async function testDeferredWhenUnset() {
  const out = await callMcpTool({ url: "" }, "search", { query: "x" });
  assert.equal(out.deferred, true);
  assert.equal(out.ok, false);
}

testParseJson();
testParseSse();
await testDeferredWhenUnset();
await testCallMcpTool();
console.log("mcp-fetch.test: PASS");
