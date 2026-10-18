#!/usr/bin/env node
/**
 * Inference stub for Lab 5b: /healthz + multi-turn chat completions.
 * Proves AgentSession fetch()es ≥2 model turns with a bind-on-create
 * virtual key Bearer. Real PAL / DeductionService stay on clawql-inference.
 */
import { createServer } from "node:http";

const port = Number(process.env.INFERENCE_STUB_PORT || process.argv[2] || 19082);
/** @type {Map<string, { turns: number, boundAt: number }>} */
const keys = new Map();
let turnCount = 0;

function bindVirtualKey(req, body) {
  const auth = req.headers.authorization || "";
  const headerKey = (req.headers["x-clawql-virtual-key"] || "").toString().trim();
  const bearer =
    auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const virtualKeyId =
    headerKey || bearer || (typeof body.virtualKeyId === "string" ? body.virtualKeyId : "");
  if (!virtualKeyId) {
    return { ok: false, error: "missing_virtual_key" };
  }
  if (!keys.has(virtualKeyId)) {
    keys.set(virtualKeyId, { turns: 0, boundAt: Date.now() });
  }
  const rec = keys.get(virtualKeyId);
  rec.turns += 1;
  return { ok: true, virtualKeyId, turnsForKey: rec.turns, boundAt: rec.boundAt };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  if (req.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/health")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        source: "streams-celld-inference-stub",
        transport: "http",
        turnCount,
        keysBound: keys.size,
      })
    );
    return;
  }

  const isChat =
    req.method === "POST" &&
    (url.pathname === "/v1/messages" ||
      url.pathname === "/v1/chat/completions" ||
      url.pathname === "/v1/chat");
  if (isChat) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      body = {};
    }
    const bound = bindVirtualKey(req, body);
    if (!bound.ok) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: bound.error }));
      return;
    }
    turnCount += 1;
    const text =
      typeof body.prompt === "string"
        ? `ack:${body.prompt.slice(0, 80)}`
        : `ack:turn-${turnCount}`;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        source: "streams-celld-inference-stub",
        id: `inf_stub_${turnCount}`,
        turn: typeof body.turn === "number" ? body.turn : turnCount,
        priorId: body.priorId ?? null,
        model: body.model || "stub-frugal",
        virtualKeyId: bound.virtualKeyId,
        virtualKeyBound: true,
        turnsForKey: bound.turnsForKey,
        content: [{ type: "text", text }],
        usage: { input_tokens: 8, output_tokens: 12 },
      })
    );
    return;
  }

  res.writeHead(404).end("not found");
});

server.listen(port, "127.0.0.1", () => {
  console.error(
    `inference-stub: http://127.0.0.1:${port}/healthz (+ POST /v1/messages multi-turn + vk bind)`
  );
});
