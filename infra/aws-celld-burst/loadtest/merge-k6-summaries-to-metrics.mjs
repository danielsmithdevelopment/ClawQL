#!/usr/bin/env node
/**
 * Merge three k6 handleSummary JSON files → metrics.json for fill-result-from-exports.
 *
 * Fail-closed:
 *   - refuses missing/non-numeric p99 or drops from each arm summary
 *   - refuses to invent spikeSeconds (Arm B/C) — require --spike-b-seconds / --spike-c-seconds
 *     from Grafana / operator observation of the post-gap spike window
 *
 * Usage:
 *   node infra/aws-celld-burst/loadtest/merge-k6-summaries-to-metrics.mjs \
 *     --arm-a k6-a.json --arm-b k6-b.json --arm-c k6-c.json \
 *     --spike-b-seconds 45 --spike-c-seconds 20 \
 *     --out metrics.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

function usage(msg) {
  if (msg) console.error(msg);
  console.error(
    "Usage: merge-k6-summaries-to-metrics.mjs --arm-a A.json --arm-b B.json --arm-c C.json --spike-b-seconds N --spike-c-seconds N --out metrics.json"
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

function requireFinite(n, path) {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error(`${path} must be a finite number (do not invent)`);
  }
  return n;
}

/**
 * Accept either our handleSummary shape or raw k6 summary with metrics.*.values.
 */
function extractArm(summary, label) {
  const root = summary?.metrics ?? summary;
  const duration =
    root?.http_req_duration?.values ??
    root?.http_req_duration ??
    summary?.metrics?.http_req_duration?.values;
  const dropped =
    root?.burst_dropped_or_failed?.values ??
    root?.burst_dropped_or_failed ??
    summary?.metrics?.burst_dropped_or_failed?.values;

  if (!duration || typeof duration !== "object") {
    throw new Error(`${label}: missing http_req_duration values`);
  }
  const p99 = duration["p(99)"] ?? duration.p99 ?? duration["p99"] ?? duration["p(99.0)"];
  if (p99 == null) {
    throw new Error(
      `${label}: missing p(99) in http_req_duration (got keys: ${Object.keys(duration).join(",")})`
    );
  }
  const p99Ms = requireFinite(Number(p99), `${label}.p99Ms`);

  let drops = 0;
  if (dropped != null) {
    const raw = typeof dropped === "object" ? (dropped.count ?? dropped.value) : dropped;
    drops = requireFinite(Number(raw), `${label}.drops`);
  } else {
    throw new Error(`${label}: missing burst_dropped_or_failed values — refuse inventing drops=0`);
  }

  return { p99Ms, drops };
}

try {
  const args = parseArgs(process.argv);
  for (const k of ["arm-a", "arm-b", "arm-c", "spike-b-seconds", "spike-c-seconds", "out"]) {
    if (!args[k]) usage(`missing --${k}`);
  }

  const a = extractArm(JSON.parse(readFileSync(resolve(args["arm-a"]), "utf8")), "arm-a");
  const b = extractArm(JSON.parse(readFileSync(resolve(args["arm-b"]), "utf8")), "arm-b");
  const c = extractArm(JSON.parse(readFileSync(resolve(args["arm-c"]), "utf8")), "arm-c");
  const spikeB = requireFinite(Number(args["spike-b-seconds"]), "spike-b-seconds");
  const spikeC = requireFinite(Number(args["spike-c-seconds"]), "spike-c-seconds");
  if (spikeB < 0 || spikeC < 0) {
    throw new Error("spike seconds must be >= 0");
  }

  const metrics = {
    armA: { p99Ms: a.p99Ms, drops: a.drops },
    armB: { p99Ms: b.p99Ms, spikeSeconds: spikeB, drops: b.drops },
    armC: { p99Ms: c.p99Ms, spikeSeconds: spikeC, drops: c.drops },
    attachments: {
      k6: args["attach-k6"] || "",
      grafana: args["attach-grafana"] || "",
      costExplorer: args["attach-ce"] || "",
    },
    note: "Merged from k6 summaries; spikeSeconds operator-supplied (not invented from aggregate JSON)",
  };

  const outPath = resolve(args.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(metrics, null, 2) + "\n");
  console.log(`Wrote ${outPath}`);
  console.log(
    JSON.stringify({ armA: metrics.armA, armB: metrics.armB, armC: metrics.armC }, null, 2)
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
