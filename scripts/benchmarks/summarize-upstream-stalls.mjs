#!/usr/bin/env node
/**
 * Correlate [clawql-upstream-fetch] (ClawQL→mock) with [mt-upstream] (mock accept/handle)
 * and optional [clawql-http-slow] execute lines from a multiturn stderr log.
 *
 * Usage:
 *   node scripts/benchmarks/summarize-upstream-stalls.mjs /opt/cursor/artifacts/upstream-*.stderr.log
 */
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: summarize-upstream-stalls.mjs <stderr.log>");
  process.exit(2);
}

const text = readFileSync(path, "utf8");
const lines = text.split(/\n/);

function parseKv(line) {
  const out = {};
  for (const m of line.matchAll(/([a-z_]+)=(\S+)/g)) {
    out[m[1]] = m[2];
  }
  const ms = line.match(/\[(?:clawql-upstream-fetch|mt-upstream|clawql-http-slow)\]\s+([0-9.]+)ms/);
  if (ms) out._ms = Number(ms[1]);
  // clawql-upstream-fetch uses total_ms= not leading ms
  if (out.total_ms != null) out._ms = Number(out.total_ms);
  return out;
}

const upstream = [];
const mock = [];
const executeSlow = [];
for (const line of lines) {
  if (line.includes("[clawql-upstream-fetch]")) upstream.push({ line, ...parseKv(line) });
  else if (line.includes("[mt-upstream]")) mock.push({ line, ...parseKv(line) });
  else if (line.includes("[clawql-http-slow]") && line.includes("tool=execute")) {
    executeSlow.push({ line, ...parseKv(line) });
  }
}

upstream.sort((a, b) => (b._ms || 0) - (a._ms || 0));
mock.sort((a, b) => (b._ms || 0) - (a._ms || 0));
executeSlow.sort((a, b) => (b._ms || 0) - (a._ms || 0));

function nearestMock(iso, windowMs = 50) {
  if (!iso || iso === "-") return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  let best = null;
  for (const m of mock) {
    const mt = Date.parse(m.arrive || m.arrive_iso || "");
    if (!Number.isFinite(mt)) continue;
    const d = Math.abs(mt - t);
    if (d <= windowMs && (!best || d < best.d)) best = { d, m };
  }
  return best;
}

const top = upstream.slice(0, 15).map((u) => {
  const near = nearestMock(u.issue_iso, 80);
  const mockHandle = near?.m?._ms ?? null;
  const headersMs = Number(u.headers_ms);
  const classification =
    mockHandle != null && mockHandle >= 0.5 * (u._ms || 0)
      ? "mock_slow"
      : headersMs >= 0.7 * (u._ms || 0) && (mockHandle == null || mockHandle < 5)
        ? "clawql_outbound_or_connect"
        : mockHandle != null && mockHandle < 5 && headersMs > 20
          ? "clawql_outbound_before_mock"
          : "mixed_or_read_path";
  return {
    total_ms: u._ms,
    headers_ms: headersMs,
    body_ms: Number(u.body_ms),
    backend: u.backend,
    tcp_connects_delta: u.tcp_connects_delta,
    issue_iso: u.issue_iso,
    mock_handle_ms: mockHandle,
    mock_new_conn: near?.m?.new_conn ?? null,
    mock_arrive_delta_ms: near?.d ?? null,
    classification,
  };
});

const summary = {
  path,
  counts: {
    clawql_upstream_fetch: upstream.length,
    mt_upstream: mock.length,
    clawql_http_slow_execute: executeSlow.length,
  },
  top_upstream: top,
  top_mock: mock.slice(0, 10).map((m) => ({
    handle_ms: m._ms,
    arrive: m.arrive,
    new_conn: m.new_conn,
    path: m.path,
    tcp_connects: m.tcp_connects,
  })),
  top_execute_server: executeSlow.slice(0, 10).map((e) => ({
    ms: e._ms,
    t0: e.t0,
    t1: e.t1,
  })),
  read:
    "mock_slow = mock handle ≈ ClawQL wait; clawql_outbound_* = mock fast/late vs issue_iso; " +
    "tcp_connects_delta>0 on node-fetch without keepalive is expected per request.",
};

console.log(JSON.stringify(summary, null, 2));
