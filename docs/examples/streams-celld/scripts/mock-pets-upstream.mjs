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

/** @type {{ id: string, key: string, at: string, name: string, generation: number }[]} */
const writes = [];
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
  if (!(hangMs > 0)) return Promise.resolve({ aborted: false });
  return new Promise((resolve) => {
    let done = false;
    const finish = (aborted) => {
      if (done) return;
      done = true;
      resolve({ aborted });
    };
    const t = setTimeout(() => finish(false), hangMs);
    req.on("close", () => {
      clearTimeout(t);
      finish(true);
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  const hangMs = Number(url.searchParams.get("hangMs") || 0);

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
    generation += 1;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, generation }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/pets") {
    if (hangMs > 0) await new Promise((r) => setTimeout(r, hangMs));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ pets: [{ id: 1, name: "celld-core" }] }));
    return;
  }
  if (
    (req.method === "GET" || req.method === "POST") &&
    url.pathname === "/streams/session/noop"
  ) {
    let body = {};
    if (req.method === "POST") body = await readBody(req);
    else body = Object.fromEntries(url.searchParams.entries());
    if (hangMs > 0) await new Promise((r) => setTimeout(r, hangMs));
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
    const id = `owner_${Date.now()}_${writes.length}`;
    writes.push({
      id,
      key: String(key),
      at: new Date().toISOString(),
      name: body.name || "lab",
      generation: genAtStart,
    });
    inFlight = Math.max(0, inFlight - 1);
    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify({ id, name: body.name || "lab", host: "mock-pets-upstream", key }));
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
