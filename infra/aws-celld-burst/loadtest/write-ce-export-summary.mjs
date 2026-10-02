#!/usr/bin/env node
/**
 * Write ce-export-summary.json after export-cost-explorer-arms.sh.
 * Does not invent $Y — only summarizes existing CSV row counts.
 *
 * Usage: node write-ce-export-summary.mjs <ce-export-dir>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "artifacts/ce-export";
const arms = ["a", "b", "c"].map((arm) => {
  const p = join(dir, `ce-arm-${arm}.csv`);
  const lines = readFileSync(p, "utf8").trim().split(/\n/);
  return { arm, rows: Math.max(0, lines.length - 1), path: p };
});
const summary = {
  status: "ce-export",
  start: process.env.CLAWQL_S13_START ?? null,
  end: process.env.CLAWQL_S13_END ?? null,
  arms,
  honesty:
    "Cost Explorer CSVs only — not filled dollarY until k6 metrics + fill-result-from-exports.mjs",
};
const out = join(dir, "ce-export-summary.json");
writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary));
