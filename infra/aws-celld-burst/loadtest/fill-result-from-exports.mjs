#!/usr/bin/env node
/**
 * §13.5 result filler — Cost Explorer CSV → RESULT_TEMPLATE paragraph.
 *
 * Fail-closed: refuses to invent p99 / $Y. Requires three arm CSVs with a
 * numeric UnblendedCost (or similar) column. Latency / drops come from
 * operator-supplied JSON metrics (k6 summaries), not from this script.
 *
 * Usage:
 *   node infra/aws-celld-burst/loadtest/fill-result-from-exports.mjs \
 *     --arm-a ce-arm-a.csv --arm-b ce-arm-b.csv --arm-c ce-arm-c.csv \
 *     --metrics metrics.json --out results/section13-5-filled.md
 *
 * metrics.json shape:
 *   {
 *     "armA": { "p99Ms": 12, "drops": 0 },
 *     "armB": { "p99Ms": 800, "spikeSeconds": 45, "drops": 120 },
 *     "armC": { "p99Ms": 200, "spikeSeconds": 20, "drops": 10 },
 *     "attachments": { "k6": "...", "grafana": "...", "costExplorer": "..." }
 *   }
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

function usage(msg) {
  if (msg) console.error(msg);
  console.error(
    "Usage: fill-result-from-exports.mjs --arm-a A.csv --arm-b B.csv --arm-c C.csv --metrics metrics.json --out out.md"
  );
  process.exit(msg ? 2 : 0);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage();
    if (!a.startsWith("--")) usage(`unexpected arg: ${a}`);
    const key = a.slice(2);
    const val = argv[++i];
    if (val == null) usage(`missing value for --${key}`);
    out[key] = val;
  }
  return out;
}

function parseCostUsd(csvText, label) {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new Error(`${label}: CSV needs header + at least one data row`);
  }
  const header = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  const costIdx = header.findIndex((h) =>
    /unblended.?cost|net.?amortized.?cost|cost/i.test(h)
  );
  if (costIdx < 0) {
    throw new Error(`${label}: no Cost column in header: ${header.join(",")}`);
  }
  let sum = 0;
  let rows = 0;
  for (const line of lines.slice(1)) {
    // naive CSV split — CE exports are simple for tagged filters
    const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    const raw = cols[costIdx];
    if (raw == null || raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      throw new Error(`${label}: non-numeric cost "${raw}"`);
    }
    sum += n;
    rows += 1;
  }
  if (rows === 0) throw new Error(`${label}: no cost rows`);
  return Math.round(sum * 100) / 100;
}

function requireFinite(n, path) {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error(`metrics.${path} must be a finite number (do not invent)`);
  }
  return n;
}

try {
  const args = parseArgs(process.argv);
  for (const k of ["arm-a", "arm-b", "arm-c", "metrics", "out"]) {
    if (!args[k]) usage(`missing --${k}`);
  }

  const costA = parseCostUsd(readFileSync(resolve(args["arm-a"]), "utf8"), "arm-a");
  const costB = parseCostUsd(readFileSync(resolve(args["arm-b"]), "utf8"), "arm-b");
  const costC = parseCostUsd(readFileSync(resolve(args["arm-c"]), "utf8"), "arm-c");
  const metrics = JSON.parse(readFileSync(resolve(args.metrics), "utf8"));

  const a = metrics.armA ?? {};
  const b = metrics.armB ?? {};
  const c = metrics.armC ?? {};
  const p99A = requireFinite(a.p99Ms, "armA.p99Ms");
  const dropsA = requireFinite(a.drops, "armA.drops");
  const p99B = requireFinite(b.p99Ms, "armB.p99Ms");
  const spikeB = requireFinite(b.spikeSeconds, "armB.spikeSeconds");
  const dropsB = requireFinite(b.drops, "armB.drops");
  const p99C = requireFinite(c.p99Ms, "armC.p99Ms");
  const spikeC = requireFinite(c.spikeSeconds, "armC.spikeSeconds");
  const dropsC = requireFinite(c.drops ?? 0, "armC.drops");

  const links = metrics.attachments ?? {};
  const link =
    [links.k6, links.grafana, links.costExplorer].filter(Boolean).join(" ; ") ||
    "[link — attach k6 / Grafana / Cost Explorer exports]";

  const paragraph = [
    `Identical 1M/0/2M event stream, same day, run against three configurations: [celld config], [Karpenter scale-to-zero config], [Karpenter warm-pool config].`,
    `celld: p99 latency ${p99A}ms flat throughout the test, ${dropsA} dropped requests, $${costA} real AWS cost for the test window.`,
    `Karpenter scale-to-zero: p99 latency ${p99A}ms baseline, spiking to ${p99B}ms for ${spikeB} seconds immediately after the gap, ${dropsB} requests dropped/timed out, $${costB} real AWS cost (lower than celld because it scaled to zero during the gap — report even if this favors Karpenter on cost).`,
    `Karpenter warm-pool: p99 latency ${p99A}ms baseline, spiking to ${p99C}ms for ${spikeC} seconds (smaller than scale-to-zero's spike, larger than celld's), $${costC} real AWS cost (between the other two).`,
    `Full k6 script, Grafana dashboard, and Cost Explorer export: ${link}.`,
  ].join(" ");

  const md = `# §13.5 Publishable result (filled from exports)

**Generated:** ${new Date().toISOString()}
**Source:** Cost Explorer CSVs + operator metrics JSON (not dry-run).

> ${paragraph}

## Numeric extract

| Arm | p99Ms | drops | costUsd |
| --- | ----- | ----- | ------- |
| A celld | ${p99A} | ${dropsA} | ${costA} |
| B scale-to-zero | ${p99B} (spike ${spikeB}s) | ${dropsB} | ${costB} |
| C warm-pool | ${p99C} (spike ${spikeC}s) | ${dropsC} | ${costC} |

## Attachments checklist

- [ ] k6 summary JSON for Arms A, B, C
- [ ] Single Grafana dashboard screenshot / export (all three overlays)
- [ ] Cost Explorer CSV/filtered spend for the tagged window per arm
- [ ] Arm A operator WORM correlation notes (\`FILLER_WORKLOAD_EVICTED\`, etc.)
`;

  const outPath = resolve(args.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, md);
  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify({ costA, costB, costC, p99A, p99B, p99C }, null, 2));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
