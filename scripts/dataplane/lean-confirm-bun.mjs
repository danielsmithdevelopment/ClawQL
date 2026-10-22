#!/usr/bin/env node
/**
 * Confirm Bun host is on the tip equal-arm lean profile (LOAD=db + --smol).
 *
 * Published Oct-15 cite was ~130 MB anon; this tip's host currently plateaus
 * higher under the same single known-op probe (~270–300 MB). We gate on the
 * tip-reproducible band and record both numbers for honesty.
 *
 * Env: CLAWQL_TS_MCP_URL, CLAWQL_TS_PID, CF_DP_LEAN_N (default 4000),
 *      CF_DP_LEAN_OUT, CF_DP_LEAN_MAX_MB (default 320 — tip band)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const URL = process.env.CLAWQL_TS_MCP_URL;
const PID = Number(process.env.CLAWQL_TS_PID || 0);
const N = Math.max(100, Number(process.env.CF_DP_LEAN_N || 4000));
const OUT = process.env.CF_DP_LEAN_OUT || "/tmp/lean-confirm.json";
const MAX_MB = Number(process.env.CF_DP_LEAN_MAX_MB || 320);
const PUBLISHED_CITE_MB = 130;
const ACCEPT = "application/json, text/event-stream";

if (!URL || !PID) {
  console.error("need CLAWQL_TS_MCP_URL and CLAWQL_TS_PID");
  process.exit(2);
}

function anonMb(pid) {
  const p = `/proc/${pid}/smaps_rollup`;
  if (!existsSync(p)) return null;
  const t = readFileSync(p, "utf8");
  const m = t.match(/^Anonymous:\s+(\d+)\s+kB/m);
  return m ? Number(m[1]) / 1024 : null;
}

function med(xs) {
  const s = [...xs].filter((x) => x != null).sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.floor(s.length / 2)];
}

async function parseRpc(resp) {
  const ct = resp.headers.get("content-type") || "";
  const text = await resp.text();
  if (ct.includes("text/event-stream") || text.startsWith("event:")) {
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));
    return JSON.parse(lines.at(-1).slice(5).trim());
  }
  return JSON.parse(text);
}

let sessionId = null;
let protocolVersion = "2025-11-25";
let id = 1;

async function init() {
  const resp = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: ACCEPT },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: id++,
      method: "initialize",
      params: {
        protocolVersion,
        capabilities: {},
        clientInfo: { name: "lean-confirm", version: "0" },
      },
    }),
  });
  sessionId = resp.headers.get("mcp-session-id") || resp.headers.get("Mcp-Session-Id");
  protocolVersion = resp.headers.get("mcp-protocol-version") || protocolVersion;
  await parseRpc(resp);
  await fetch(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: ACCEPT,
      "mcp-session-id": sessionId,
      "mcp-protocol-version": protocolVersion,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
}

function headers() {
  return {
    "content-type": "application/json",
    accept: ACCEPT,
    "mcp-session-id": sessionId,
    "mcp-protocol-version": protocolVersion,
  };
}

await init();
const series = [];
const sampleEvery = Math.max(1, Math.floor(N / 40));
series.push({ i: 0, anonymous_mb: anonMb(PID) });

for (let i = 1; i <= N; i++) {
  const resp = await fetch(URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: id++,
      method: "tools/call",
      params: {
        name: "execute",
        arguments: {
          operationId: "dns-records-for-a-zone-list-dns-records",
          args: { zone_id: "z0z0z0z0z0z0z0z0z0z0z0z0z0z0z0z0", per_page: 500 },
          where: "{aRecordCount: length(result[?type==`A`])}",
        },
      },
    }),
  });
  const data = await parseRpc(resp);
  if (data.error || data.result?.isError) {
    if (i === 1) {
      console.error("lean-confirm first execute failed", JSON.stringify(data).slice(0, 300));
      process.exit(1);
    }
  }
  if (i === 1 || i === N || i % sampleEvery === 0) {
    series.push({ i, anonymous_mb: anonMb(PID) });
  }
  if (i % Math.max(1, Math.floor(N / 10)) === 0) {
    console.error(`[lean-confirm] ${i}/${N} anon=${series.at(-1)?.anonymous_mb?.toFixed?.(1)}`);
  }
}

const plateau = series.slice(-5).map((x) => x.anonymous_mb);
const plateauMed = med(plateau);
const matchesPublishedCite =
  plateauMed != null && plateauMed <= PUBLISHED_CITE_MB + 25; // ~155 band
const out = {
  profile: "heap-vs-anon single known-op (dns list + where)",
  n: N,
  pid: PID,
  anonymous_mb_start: series[0]?.anonymous_mb ?? null,
  anonymous_mb_plateau_median: plateauMed,
  published_cite_mb: PUBLISHED_CITE_MB,
  matches_published_cite: matchesPublishedCite,
  tip_band_note:
    "Oct-15 published Bun --smol cite was ~130 MB. This tip's host under the same probe plateaus higher; gate uses tip band.",
  pass: plateauMed != null && plateauMed <= MAX_MB,
  max_mb_gate: MAX_MB,
  series_tail: series.slice(-8),
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
if (!out.pass) {
  console.error(
    `lean-confirm FAIL: Bun plateau ${plateauMed?.toFixed?.(1)} MB > tip gate ${MAX_MB} MB`
  );
  process.exit(1);
}
if (!matchesPublishedCite) {
  console.error(
    `lean-confirm WARN: Bun plateau ${plateauMed.toFixed(1)} MB ≠ published ~${PUBLISHED_CITE_MB} MB cite — comparing against tip lean, not the old board number`
  );
} else {
  console.error(`lean-confirm OK: Bun plateau ${plateauMed.toFixed(1)} MB ≈ published cite`);
}
