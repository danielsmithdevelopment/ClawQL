#!/usr/bin/env node
/**
 * Isolated Cloudflare API v4 replay mock.
 *
 * Env:
 *   FIXTURE — path to recording.synthetic.json (or sanitized live recording)
 *   MT_UPSTREAM_LATENCY — 0|off (default) | recorded | fixed:N | min-max
 *   PORT / MT_MOCK_PORT — bind port (0 = ephemeral)
 *
 * stdout: {"ready":true,"baseUrl":"...","pid":N,"fixture":"..."}
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURE = join(HERE, "../fixtures/recording.synthetic.json");
const FIXTURE_PATH = process.env.FIXTURE || DEFAULT_FIXTURE;
const PORT = Number(process.env.MT_MOCK_PORT || process.env.PORT || 0) || 0;

if (!existsSync(FIXTURE_PATH)) {
  console.error(`fixture missing: ${FIXTURE_PATH}`);
  process.exit(1);
}

const recording = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
const LATENCY_MODE = (process.env.MT_UPSTREAM_LATENCY || "0").trim().toLowerCase();

function parseLatencyMode(raw) {
  if (!raw || raw === "0" || raw === "off" || raw === "none") return { kind: "none" };
  if (raw === "recorded") return { kind: "recorded" };
  const fixed = raw.match(/^fixed:(\d+(?:\.\d+)?)$/);
  if (fixed) return { kind: "fixed", ms: Number(fixed[1]) };
  const range = raw.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (range) return { kind: "range", min: Number(range[1]), max: Number(range[2]) };
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return { kind: "fixed", ms: n };
  return { kind: "none" };
}

const latency = parseLatencyMode(LATENCY_MODE);

function sampleLatency(call) {
  if (latency.kind === "none") return 0;
  if (latency.kind === "fixed") return latency.ms;
  if (latency.kind === "range") {
    return latency.min + Math.random() * (latency.max - latency.min);
  }
  if (latency.kind === "recorded") {
    const samples = call?.latency_samples_ms;
    if (Array.isArray(samples) && samples.length) {
      return samples[Math.floor(Math.random() * samples.length)];
    }
  }
  return 0;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizePath(p) {
  // Strip /client/v4 prefix if present
  let path = p.split("?")[0];
  if (path.startsWith("/client/v4")) path = path.slice("/client/v4".length);
  if (!path.startsWith("/")) path = `/${path}`;
  return path;
}

function matchCall(method, path) {
  const m = method.toUpperCase();
  const p = normalizePath(path);
  // Exact path match first
  let hit = recording.calls.find((c) => c.method === m && normalizePath(c.path) === p);
  if (hit) return hit;
  // Template match: replace known ids
  hit = recording.calls.find((c) => {
    if (c.method !== m) return false;
    const re = new RegExp(
      "^" +
        normalizePath(c.path)
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          .replace(/\\\{[^}]+\\\}/g, "[^/]+") +
        "$"
    );
    // calls store concrete paths already in synthetic fixture
    return normalizePath(c.path) === p;
  });
  return hit || null;
}

const stats = {
  requests: 0,
  hits: 0,
  misses: 0,
  writes_blocked: 0,
  pid: process.pid,
  fixture: FIXTURE_PATH,
  latency,
};

const server = createServer(async (req, res) => {
  stats.requests += 1;
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (url.pathname === "/__bench/stats") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(stats));
    return;
  }
  if (url.pathname === "/__bench/world") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(recording.world || {}));
    return;
  }

  const method = (req.method || "GET").toUpperCase();
  const call = matchCall(method, url.pathname);
  if (!call) {
    stats.misses += 1;
    res.writeHead(404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        success: false,
        errors: [{ code: 7000, message: `mock miss ${method} ${url.pathname}` }],
        messages: [],
        result: null,
      })
    );
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    stats.writes_blocked += 1;
  }

  const delay = sampleLatency(call);
  if (delay > 0) await sleep(delay);
  stats.hits += 1;
  res.writeHead(call.status || 200, { "content-type": "application/json", "x-bench-latency-ms": String(delay) });
  res.end(JSON.stringify(call.body));
});

server.listen(PORT, "127.0.0.1", () => {
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  console.log(
    JSON.stringify({
      ready: true,
      baseUrl,
      pid: process.pid,
      fixture: FIXTURE_PATH,
      source: recording.source,
      label: recording.label,
      latency,
    })
  );
});

function shutdown() {
  console.log(JSON.stringify({ stats }));
  server.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
