#!/usr/bin/env node
/**
 * Correlate [clawql-upstream-phase] + [clawql-upstream-fetch] with [mt-upstream] arrive/done.
 *
 * Classifications (client channels):
 *   write_late     — issue → client.request.start dominates
 *   wire_or_mock   — client start → response headers dominates (pair mock arrive/done)
 *   read_late      — headers → body parse dominates
 *
 * Mock pairing (when MT_UPSTREAM_TRACE=1 logs every hit):
 *   issue→arrive delay large, mock handle small → wire/kernel after write
 *   arrive≈issue, mock handle small, headers_wait large → ClawQL read path after mock
 *
 * Usage:
 *   node scripts/benchmarks/summarize-upstream-phase.mjs /path/to/stderr.log
 */
import { readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2];
const outPath = process.argv[3];
if (!path) {
  console.error("usage: summarize-upstream-phase.mjs <stderr.log> [out.json]");
  process.exit(2);
}

const text = readFileSync(path, "utf8");
const lines = text.split(/\n/);

function parseKv(line) {
  const out = {};
  for (const m of line.matchAll(/([a-z0-9_]+)=(\S+)/gi)) {
    out[m[1]] = m[2];
  }
  return out;
}

const phases = [];
const fetches = [];
const mocks = [];
const slowFlows = [];

for (const line of lines) {
  if (line.includes("[clawql-upstream-phase]")) phases.push({ line, ...parseKv(line) });
  else if (line.includes("[clawql-upstream-fetch]")) fetches.push({ line, ...parseKv(line) });
  else if (line.includes("[mt-upstream]") && !line.includes("[mt-upstream-stats]")) {
    mocks.push({ line, ...parseKv(line) });
  } else if (line.includes("[mt] clawql_http") || line.includes("slow_flows")) {
    /* ignore */
  }
}

function nearestMock(issueIso, windowMs = 2000) {
  if (!issueIso || issueIso === "-") return null;
  const t = Date.parse(issueIso);
  if (!Number.isFinite(t)) return null;
  let best = null;
  for (const m of mocks) {
    const arrive = Date.parse(m.arrive || "");
    if (!Number.isFinite(arrive)) continue;
    // Mock should arrive at or after issue (allow small clock skew).
    const d = arrive - t;
    if (d < -5 || d > windowMs) continue;
    if (!best || d < best.issue_to_arrive_ms) {
      const done = Date.parse(m.done || "");
      best = {
        issue_to_arrive_ms: d,
        mock_handle_ms: Number(m._ms || m["0"] || NaN),
        handle_ms: Number.parseFloat(String(m.line).match(/\[mt-upstream\]\s+([0-9.]+)ms/)?.[1] || "NaN"),
        arrive: m.arrive,
        done: m.done || null,
        issue_to_done_ms: Number.isFinite(done) ? done - t : null,
        new_conn: m.new_conn,
      };
    }
  }
  return best;
}

const classCounts = {};
const top = [...phases]
  .sort((a, b) => Number(b.total_ms || 0) - Number(a.total_ms || 0))
  .slice(0, 25)
  .map((p) => {
    const cls = p.class || "unknown";
    classCounts[cls] = (classCounts[cls] || 0) + 1;
    const mock = nearestMock(p.issue_iso, 2000);
    let refined = cls;
    if (mock && cls === "wire_or_mock") {
      if (mock.issue_to_arrive_ms != null && mock.issue_to_arrive_ms >= 50 && (mock.handle_ms || 0) < 5) {
        refined = "wire_after_write"; // written (client start) but mock saw it late — or issue late vs client start already in write_delay
      } else if ((mock.handle_ms || 0) < 5 && mock.issue_to_arrive_ms != null && mock.issue_to_arrive_ms < 20) {
        refined = "response_handling_late"; // mock fast; wait was after mock answered
      }
    }
    if (cls === "write_late") refined = "event_loop_before_send";
    return {
      class: cls,
      refined,
      total_ms: Number(p.total_ms),
      write_delay_ms: Number(p.write_delay_ms),
      headers_wait_ms: Number(p.headers_wait_ms),
      body_ms: Number(p.body_ms),
      socket_nodelay: p.socket_nodelay,
      issue_iso: p.issue_iso,
      client_start_iso: p.client_start_iso,
      mock,
      backend: p.backend,
    };
  });

// Recount refined on top only for headline; also count all phases
const allClass = {};
const allRefined = {};
for (const p of phases) {
  const cls = p.class || "unknown";
  allClass[cls] = (allClass[cls] || 0) + 1;
}
for (const t of top) {
  allRefined[t.refined] = (allRefined[t.refined] || 0) + 1;
}

const summary = {
  path,
  counts: {
    phase_lines: phases.length,
    fetch_lines: fetches.length,
    mock_lines: mocks.length,
  },
  class_counts_all: allClass,
  refined_counts_top25: allRefined,
  top_phases: top,
  verdict_hint: (() => {
    const n = top.length || 1;
    const write = top.filter((t) => t.refined === "event_loop_before_send").length;
    const wire = top.filter((t) => t.refined === "wire_after_write").length;
    const read = top.filter((t) => t.refined === "response_handling_late" || t.class === "read_late").length;
    if (write / n >= 0.5) {
      return {
        code: "write_late",
        note: "Majority of top stalls spend time before http.client.request.start — profile event loop at those issue_iso stamps.",
      };
    }
    if (wire / n >= 0.5) {
      return {
        code: "wire_kernel",
        note: "Client started on time but mock arrive lagged while mock handle stayed small — check TCP_NODELAY / socket path.",
      };
    }
    if (read / n >= 0.5) {
      return {
        code: "read_late",
        note: "Mock answered promptly; delay is in ClawQL response/body handling.",
      };
    }
    return {
      code: "inconclusive",
      note: "No single phase dominates the top stalls — document tail as open.",
    };
  })(),
};

const json = JSON.stringify(summary, null, 2);
console.log(json);
if (outPath) writeFileSync(outPath, json);
