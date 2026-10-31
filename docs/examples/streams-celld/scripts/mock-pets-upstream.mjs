#!/usr/bin/env node
/**
 * Tiny upstream for Lab 5b + Tier C fleet phased kills:
 * - GET /pets, POST /streams/session/noop, POST /owners
 * - ?hangMs=N delays response (during_call phase)
 * - GET /__writes returns write ledger for duplicate counting
 * - POST /__reset bumps generation so late hang completions are ignored
 */
import { createServer } from "node:http";

const port = Number(process.env.MOCK_PETS_PORT || process.argv[2] || 9893);
/**
 * Parse ?hangMs= into a non-negative int ≤ 120000.
 * Rejects non-finite / oversized inputs before any timer is scheduled.
 * Literal 120000 (not a named const) so CodeQL's js/resource-exhaustion
 * taint barrier sees an upper limit at parse and again at each sink.
 * @param {unknown} raw
 * @returns {number}
 */
function parseHangMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const ms = Math.floor(n);
  // Comparison guard (ms > literal → clamp) is the CodeQL-recognized shape.
  if (ms > 120000) return 120000;
  return ms;
}

/**
 * Schedule a delay that is always ≤ 120000ms. Re-applies the literal cap at
 * the setTimeout sink so taint cannot flow past Math.min / helper returns.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleepBounded(ms) {
  const delay = ms > 120000 ? 120000 : ms < 0 ? 0 : ms;
  if (delay <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    // codeql[js/resource-exhaustion]: localhost Lab 5b mock; delay capped to 120000 above.
    setTimeout(resolve, delay);
  });
}

/** @type {{ id: string, key: string, at: string, name: string, generation: number }[]} */
const writes = [];
/** Observe-only mandate statuses for plan await_approval (fleet / CellDO). */
/** @type {Map<string, string>} */
const pending = new Map();
let inFlight = 0;
/** Bumped on /__reset so late hang completions from prior trials are ignored. */
let generation = 1;

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

/** Hang for hangMs unless the client disconnects (SIGKILL of celld closes the socket). */
function hangOrAbort(req, hangMs) {
  const delay = hangMs > 120000 ? 120000 : hangMs < 0 ? 0 : hangMs;
  if (!(delay > 0)) return Promise.resolve({ aborted: false });
  return new Promise((resolve) => {
    let done = false;
    const finish = (aborted) => {
      if (done) return;
      done = true;
      resolve({ aborted });
    };
    // codeql[js/resource-exhaustion]: localhost Lab 5b mock; delay capped to 120000 above.
    const t = setTimeout(() => finish(false), delay);
    req.on("close", () => {
      clearTimeout(t);
      finish(true);
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  const hangMs = parseHangMs(url.searchParams.get("hangMs") || 0);

  if (req.method === "GET" && url.pathname === "/__writes") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        count: writes.length,
        inFlight,
        generation,
        uniqueKeys: [...new Set(writes.map((w) => w.key))].length,
        writes,
      })
    );
    return;
  }
  if (req.method === "POST" && url.pathname === "/__reset") {
    writes.length = 0;
    inFlight = 0;
    pending.clear();
    generation += 1;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, generation }));
    return;
  }
  // Observe-only pending mandate store for ProgramCellDO await_approval (never consumes).
  if (req.method === "GET" && url.pathname.startsWith("/__pending/")) {
    const executionId = decodeURIComponent(url.pathname.slice("/__pending/".length));
    if (!executionId || !pending.has(executionId)) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, status: null, error: "not_found" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, executionId, status: pending.get(executionId) }));
    return;
  }
  if (
    (req.method === "PUT" || req.method === "POST") &&
    (url.pathname === "/__pending" || url.pathname === "/__pending/")
  ) {
    const body = await readBody(req);
    const executionId = typeof body.executionId === "string" ? body.executionId.trim() : "";
    const status = typeof body.status === "string" ? body.status.trim() : "";
    if (!executionId.startsWith("pex_") || !status) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: false,
          error: 'body must be { "executionId": "pex_…", "status": "pending"|"approved"|… }',
        })
      );
      return;
    }
    pending.set(executionId, status);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, executionId, status }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/pets") {
    if (hangMs > 0) await sleepBounded(hangMs);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ pets: [{ id: 1, name: "celld-core" }] }));
    return;
  }
  if ((req.method === "GET" || req.method === "POST") && url.pathname === "/streams/session/noop") {
    let body = {};
    if (req.method === "POST") body = await readBody(req);
    else body = Object.fromEntries(url.searchParams.entries());
    if (hangMs > 0) await sleepBounded(hangMs);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: "noop",
        inCell: false,
        host: "mock-pets-upstream",
        args: body,
      })
    );
    return;
  }
  if (req.method === "POST" && url.pathname === "/owners") {
    const genAtStart = generation;
    inFlight += 1;
    const body = await readBody(req);
    const key =
      req.headers["idempotency-key"] ||
      body.idempotencyKey ||
      body.name ||
      `anon_${writes.length + 1}`;
    const hang = await hangOrAbort(req, hangMs);
    if (hang.aborted || genAtStart !== generation) {
      inFlight = Math.max(0, inFlight - 1);
      if (!res.headersSent) {
        res.writeHead(499, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, dropped: true, aborted: hang.aborted }));
      }
      return;
    }
    // Deterministic id from idempotency key so a no-crash twin with the same
    // plan args yields an identical result digest after resume (claim-path
    // statePreserved). Still one ledger row per unique key (duplicate detection).
    const keyStr = String(key);
    const existing = writes.find((w) => w.key === keyStr && w.generation === genAtStart);
    if (existing) {
      inFlight = Math.max(0, inFlight - 1);
      res.writeHead(201, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: existing.id,
          name: existing.name,
          host: "mock-pets-upstream",
          key: keyStr,
        })
      );
      return;
    }
    const id = `owner_${keyStr.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96)}`;
    writes.push({
      id,
      key: keyStr,
      at: new Date().toISOString(),
      name: body.name || "lab",
      generation: genAtStart,
    });
    inFlight = Math.max(0, inFlight - 1);
    res.writeHead(201, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ id, name: body.name || "lab", host: "mock-pets-upstream", key: keyStr })
    );
    return;
  }
  if (req.method === "GET" && url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, inFlight, writeCount: writes.length }));
    return;
  }
  res.writeHead(404).end("not found");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock-pets-upstream listening on http://127.0.0.1:${port}`);
});
