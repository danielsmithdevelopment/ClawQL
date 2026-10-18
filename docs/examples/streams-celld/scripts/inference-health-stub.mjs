#!/usr/bin/env node
/**
 * Inference stub for Lab 5b: /healthz + multi-turn + virtual-key budget/expire.
 * Local stand-in for clawql-inference keys (no provider keys / DeductionService ledger).
 */
import { createServer } from "node:http";

const port = Number(process.env.INFERENCE_STUB_PORT || process.argv[2] || 19082);
const defaultBudgetUsd = Number(process.env.INFERENCE_STUB_BUDGET_USD || "1");
const costPerTurnUsd = Number(process.env.INFERENCE_STUB_COST_PER_TURN_USD || "0.01");

/** @type {Map<string, { turns: number, boundAt: number, budgetUsd: number, spentUsd: number, expiredAt: number | null }>} */
const keys = new Map();
let turnCount = 0;

function readBody(req) {
  return new Promise(async (resolve) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
    } catch {
      resolve({});
    }
  });
}

function extractKeyId(req, body) {
  const auth = req.headers.authorization || "";
  const headerKey = (req.headers["x-clawql-virtual-key"] || "").toString().trim();
  const bearer =
    auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return (
    headerKey ||
    bearer ||
    (typeof body.virtualKeyId === "string" ? body.virtualKeyId : "")
  );
}

function ensureKey(virtualKeyId, budgetUsd) {
  if (!keys.has(virtualKeyId)) {
    keys.set(virtualKeyId, {
      turns: 0,
      boundAt: Date.now(),
      budgetUsd: Number.isFinite(budgetUsd) ? budgetUsd : defaultBudgetUsd,
      spentUsd: 0,
      expiredAt: null,
    });
  }
  return keys.get(virtualKeyId);
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
        defaultBudgetUsd,
        costPerTurnUsd,
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/keys/bind") {
    const body = await readBody(req);
    const virtualKeyId =
      typeof body.virtualKeyId === "string" && body.virtualKeyId
        ? body.virtualKeyId
        : `vk_lab_${Math.random().toString(16).slice(2, 10)}`;
    const budgetUsd =
      typeof body.budgetUsd === "number" ? body.budgetUsd : defaultBudgetUsd;
    const rec = ensureKey(virtualKeyId, budgetUsd);
    rec.budgetUsd = budgetUsd;
    rec.expiredAt = null;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        virtualKeyId,
        budgetUsd: rec.budgetUsd,
        spentUsd: rec.spentUsd,
        virtualKeyBound: true,
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/keys/expire") {
    const body = await readBody(req);
    const virtualKeyId = extractKeyId(req, body);
    if (!virtualKeyId || !keys.has(virtualKeyId)) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "unknown_virtual_key" }));
      return;
    }
    const rec = keys.get(virtualKeyId);
    rec.expiredAt = Date.now();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        virtualKeyId,
        expiredAt: rec.expiredAt,
        spentUsd: rec.spentUsd,
        budgetUsd: rec.budgetUsd,
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
    const body = await readBody(req);
    const virtualKeyId = extractKeyId(req, body);
    if (!virtualKeyId) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "missing_virtual_key" }));
      return;
    }
    const rec = ensureKey(
      virtualKeyId,
      typeof body.budgetUsd === "number" ? body.budgetUsd : defaultBudgetUsd
    );
    if (rec.expiredAt) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: false,
          error: "virtual_key_expired",
          virtualKeyId,
          expiredAt: rec.expiredAt,
        })
      );
      return;
    }
    if (rec.spentUsd + costPerTurnUsd > rec.budgetUsd + 1e-12) {
      res.writeHead(402, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: false,
          error: "insufficient_quota",
          virtualKeyId,
          budgetUsd: rec.budgetUsd,
          spentUsd: rec.spentUsd,
          costPerTurnUsd,
        })
      );
      return;
    }
    rec.turns += 1;
    rec.spentUsd = Number((rec.spentUsd + costPerTurnUsd).toFixed(6));
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
        virtualKeyId,
        virtualKeyBound: true,
        turnsForKey: rec.turns,
        budgetUsd: rec.budgetUsd,
        spentUsd: rec.spentUsd,
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
    `inference-stub: http://127.0.0.1:${port}/healthz (+ bind/expire + multi-turn + budget)`
  );
});
