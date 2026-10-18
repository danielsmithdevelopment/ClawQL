#!/usr/bin/env node
/**
 * Inference stub for Lab 5b: /healthz + one-turn chat completions.
 * Real PAL / virtual keys stay on clawql-inference; this proves AgentSession
 * fetch()es a model turn (Streams §3.5 skeleton).
 */
import { createServer } from "node:http";

const port = Number(process.env.INFERENCE_STUB_PORT || process.argv[2] || 19082);
let turnCount = 0;

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
        turn: turnCount,
        model: body.model || "stub-frugal",
        content: [{ type: "text", text }],
        usage: { input_tokens: 8, output_tokens: 12 },
      })
    );
    return;
  }

  res.writeHead(404).end("not found");
});

server.listen(port, "127.0.0.1", () => {
  console.error(`inference-stub: http://127.0.0.1:${port}/healthz (+ POST /v1/messages)`);
});
