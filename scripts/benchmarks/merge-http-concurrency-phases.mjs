#!/usr/bin/env node
/** Merge two http-concurrency-*.json phase outputs into one report. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const [p1, p2, out] = process.argv.slice(2);
if (!p1 || !p2 || !out) {
  console.error("usage: merge-http-concurrency-phases.mjs phase1.json phase2.json out.json");
  process.exit(2);
}

function load(p) {
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

const a = load(p1);
const b = load(p2);
if (!a && !b) {
  console.error("no phase outputs");
  process.exit(1);
}
if (!b) {
  if (a) writeFileSync(out, JSON.stringify({ ...a, partial: Boolean(a.partial) }, null, 2) + "\n");
  console.log("phase2 missing; kept phase1");
  process.exit(0);
}
if (!a) {
  writeFileSync(out, JSON.stringify(b, null, 2) + "\n");
  console.log("only phase2");
  process.exit(0);
}

const arms = [...(a.arms || []), ...(b.arms || [])];
const THRESHOLDS = a.slo?.thresholds_p99_ms || [100, 250, 500];

function range(vals) {
  const s = [...vals].sort((x, y) => x - y);
  return { reps: vals, min: s[0], max: s[s.length - 1], median: s[Math.floor(s.length / 2)] };
}

const byPrimary = new Map();
for (const r of arms) {
  if (!byPrimary.has(r.id)) byPrimary.set(r.id, []);
  byPrimary.get(r.id).push(r.sustained_concurrency_before_break);
}
const ranges = Object.fromEntries([...byPrimary].map(([id, v]) => [id, range(v)]));

const ranges_by_threshold = {};
for (const T of THRESHOLDS) {
  const by = new Map();
  for (const r of arms) {
    const sus = r.thresholds?.[String(T)]?.sustained_concurrency;
    if (sus == null) continue;
    if (!by.has(r.id)) by.set(r.id, []);
    by.get(r.id).push(sus);
  }
  ranges_by_threshold[String(T)] = Object.fromEntries([...by].map(([id, v]) => [id, range(v)]));
}

const saturation_by_arm = {};
for (const r of arms) {
  if (!r.saturation_throughput) continue;
  if (!saturation_by_arm[r.id]) saturation_by_arm[r.id] = [];
  saturation_by_arm[r.id].push(r.saturation_throughput);
}
for (const [id, vals] of Object.entries(saturation_by_arm)) {
  const rps = vals.map((v) => v.peak_rps).sort((x, y) => x - y);
  saturation_by_arm[id] = {
    reps: vals,
    peak_rps_median: rps[Math.floor(rps.length / 2)],
    peak_rps_min: rps[0],
    peak_rps_max: rps[rps.length - 1],
  };
}

const merged = {
  ...a,
  measuredAt: new Date().toISOString(),
  partial: false,
  merged_from: ["phase1_ag_exec", "phase2_clawql_mj"],
  ranges,
  ranges_by_threshold,
  saturation_by_arm,
  board: Object.fromEntries(
    arms.map((r) => [
      `${r.id}_rep${r.rep}`,
      {
        sustained: r.sustained_concurrency_before_break,
        first_break: r.first_break_clients,
        break_reason: r.break_reason,
        thresholds: r.thresholds,
        saturation_throughput: r.saturation_throughput,
        host_censored_at_clients: r.host_censored_at_clients,
        rep: r.rep,
      },
    ])
  ),
  arms,
};
writeFileSync(out, JSON.stringify(merged, null, 2) + "\n");
console.log(
  JSON.stringify({
    wrote: out,
    arms: arms.length,
    ids: [...new Set(arms.map((x) => x.id))],
  })
);
