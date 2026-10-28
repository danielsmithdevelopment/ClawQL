#!/usr/bin/env node
/**
 * Mock upstream ledger for Golem WriteAgent crash trials.
 * Honors Idempotency-Key when X-Upstream-Mode=idempotent.
 * Delays response by X-Hold-Ms so simulate-crash can land mid-flight.
 */
import { createServer } from "node:http";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const port = Number(process.env.LEDGER_PORT || 18765);
const logPath = process.env.LEDGER_LOG || "/tmp/golem-ledger.log";
mkdirSync(dirname(logPath), { recursive: true });
writeFileSync(logPath, "", "utf8");

const seenIdem = new Set();
let once = 0;
const effects = [];

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/effects") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ effects, count: effects.length }));
    return;
  }
  if (req.method === "POST" && req.url === "/charge") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString("utf8");
    const mode = String(req.headers["x-upstream-mode"] || "non_idempotent");
    const key = String(req.headers["idempotency-key"] || "");
    const holdMs = Math.max(0, Number(req.headers["x-hold-ms"] || 0));

    // Apply the side effect immediately, then delay the HTTP response so a
    // mid-flight crash can land after the write but before the agent sees 200.
    let effectId;
    let applied = true;
    if (mode === "idempotent") {
      effectId = `idem:${key}`;
      if (seenIdem.has(effectId)) applied = false;
      else seenIdem.add(effectId);
    } else {
      once += 1;
      effectId = `once:${once}`;
    }
    if (applied) {
      effects.push({ effectId, key, mode, at: new Date().toISOString() });
      appendFileSync(
        logPath,
        `${JSON.stringify({ effectId, key, mode, applied: true })}\n`
      );
    }
    if (holdMs > 0) await new Promise((r) => setTimeout(r, holdMs));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, effectId, applied }));
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`ledger listening on http://127.0.0.1:${port} log=${logPath}`);
});
