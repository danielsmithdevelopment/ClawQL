#!/usr/bin/env node
/**
 * Equal-arm fat catalog HTTP mock — **standalone process**.
 *
 * Must not share an event loop with the multiturn load client (see stall-memory-round7/8).
 *
 * Env:
 *   CATALOG_TOOL_COUNT (default 40)
 *   MT_LIMIT (default 25) — used only as OpenAPI default; per-request limit wins
 *   MT_UPSTREAM_LATENCY_MS — fixed ms, or "min-max" (e.g. 20-100) artificial delay before respond
 *   MT_UPSTREAM_DIAG / MT_STALL_DIAG / MT_UPSTREAM_SLOW_MS — slow-request logs
 *   PORT / MT_MOCK_PORT — optional fixed port (default 0 = ephemeral)
 *
 * Protocol:
 *   stdout line: {"ready":true,"baseUrl":"http://127.0.0.1:PORT","pid":N,"latency_ms":...}
 *   GET /__bench/stats → JSON counters
 *   SIGTERM / SIGINT → print {"stats":...} on stdout and exit
 */
import { createServer } from "node:http";
import { performance } from "node:perf_hooks";

const TOOL_COUNT = Math.max(4, Math.min(200, Number(process.env.CATALOG_TOOL_COUNT ?? 40) || 40));
const DEFAULT_LIMIT = Math.min(100, Math.max(1, Number(process.env.MT_LIMIT ?? 25) || 25));
const PORT = Number(process.env.MT_MOCK_PORT || process.env.PORT || 0) || 0;

function parseLatencyMs() {
  const raw = (process.env.MT_UPSTREAM_LATENCY_MS ?? "").trim();
  if (!raw) return { kind: "none" };
  const range = raw.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min && min >= 0) {
      return { kind: "range", min, max };
    }
  }
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return { kind: "fixed", ms: n };
  return { kind: "none" };
}

const LATENCY = parseLatencyMs();

function latencySampleMs() {
  if (LATENCY.kind === "fixed") return LATENCY.ms;
  if (LATENCY.kind === "range") {
    return LATENCY.min + Math.random() * (LATENCY.max - LATENCY.min);
  }
  return 0;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function toolName(i) {
  return `catalog_list_${String(i).padStart(3, "0")}`;
}

function fatRow(i) {
  return {
    id: i,
    name: `Entity-${i}`,
    status: i % 3 === 0 ? "sold" : "available",
    tag: `tag-${i % 10}`,
    meta: {
      kennel: `K${i % 5}`,
      notes: "x".repeat(80),
      history: Array.from({ length: 5 }, (_, j) => ({ at: j, event: `e-${j}` })),
    },
  };
}

function diagEnabled() {
  return ["1", "true", "yes"].includes((process.env.MT_UPSTREAM_DIAG ?? "").trim().toLowerCase()) ||
    ["1", "true", "yes"].includes((process.env.MT_STALL_DIAG ?? "").trim().toLowerCase());
}

function slowMs() {
  const n = Number(process.env.MT_UPSTREAM_SLOW_MS || 5);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

const diag = diagEnabled();
const slowThreshold = slowMs();
const stats = {
  requests: 0,
  tcp_connects: 0,
  reused_sockets: 0,
  new_socket_requests: 0,
  max_handle_ms: 0,
  max_latency_inject_ms: 0,
  slow_top: [],
  pid: process.pid,
  latency: LATENCY,
};

const seenSockets = new WeakSet();

const server = createServer(async (req, res) => {
  const tArrive = performance.now();
  const arriveIso = new Date().toISOString();
  stats.requests += 1;
  const sock = req.socket;
  const newConn = sock && !seenSockets.has(sock);
  if (sock) {
    if (newConn) {
      seenSockets.add(sock);
      stats.new_socket_requests += 1;
    } else {
      stats.reused_sockets += 1;
    }
  }

  const u = new URL(req.url || "/", "http://127.0.0.1");
  if (u.pathname === "/__bench/stats") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(stats));
    return;
  }

  const m = u.pathname.match(/^\/catalog\/(\d{3})$/);
  if (!m) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  const injectMs = latencySampleMs();
  if (injectMs > 0) {
    if (injectMs > stats.max_latency_inject_ms) stats.max_latency_inject_ms = injectMs;
    await sleep(injectMs);
  }

  const partition = Number(m[1]);
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT));
  const status = u.searchParams.get("status") ?? "any";
  const includeMeta = u.searchParams.get("includeMeta") !== "false";
  const rows = [];
  for (let i = 1; rows.length < limit; i++) {
    const row = fatRow(i + (partition - 1) * 1000);
    if (status !== "any" && row.status !== status) continue;
    if (!includeMeta) {
      rows.push({ id: row.id, name: row.name, status: row.status });
    } else {
      rows.push(row);
    }
  }
  const body = JSON.stringify({ items: rows, partition: toolName(partition) });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(body);

  const handleMs = performance.now() - tArrive;
  if (handleMs > stats.max_handle_ms) stats.max_handle_ms = handleMs;
  if (diag && handleMs >= slowThreshold) {
    const entry = {
      handle_ms: Number(handleMs.toFixed(1)),
      inject_ms: Number(injectMs.toFixed(1)),
      arrive_iso: arriveIso,
      path: u.pathname,
      new_conn: newConn ? 1 : 0,
      remote_port: sock?.remotePort ?? null,
      body_bytes: Buffer.byteLength(body),
    };
    stats.slow_top.push(entry);
    if (stats.slow_top.length > 40) {
      stats.slow_top.sort((a, b) => b.handle_ms - a.handle_ms);
      stats.slow_top.length = 20;
    }
    console.error(
      `[mt-upstream] ${entry.handle_ms}ms path=${entry.path} arrive=${arriveIso} ` +
        `inject_ms=${entry.inject_ms} new_conn=${entry.new_conn} tcp_connects=${stats.tcp_connects} ` +
        `remote_port=${entry.remote_port ?? "-"} body_bytes=${entry.body_bytes}`
    );
  }
  if (diag && (stats.requests === 1 || stats.requests % 500 === 0)) {
    console.error(
      `[mt-upstream-stats] requests=${stats.requests} tcp_connects=${stats.tcp_connects} ` +
        `new_socket_requests=${stats.new_socket_requests} reused=${stats.reused_sockets} ` +
        `max_handle_ms=${stats.max_handle_ms.toFixed(1)} pid=${process.pid}`
    );
  }
});

server.on("connection", () => {
  stats.tcp_connects += 1;
});

function shutdown() {
  const payload = JSON.stringify({ stats });
  try {
    process.stdout.write(payload + "\n");
  } catch {
    /* ignore */
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.listen(PORT, "127.0.0.1", () => {
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  process.stdout.write(
    JSON.stringify({
      ready: true,
      baseUrl,
      pid: process.pid,
      tool_count: TOOL_COUNT,
      latency: LATENCY,
    }) + "\n"
  );
});
