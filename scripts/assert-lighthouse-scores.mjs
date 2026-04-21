#!/usr/bin/env node
/**
 * Fail CI when Lighthouse category scores fall below configured minimums.
 *
 * Usage:
 *   node scripts/assert-lighthouse-scores.mjs website/lighthouse-ci.json
 *
 * Optional env (0–1 floats, defaults shown):
 *   LH_MIN_PERF=0.55 LH_MIN_A11Y=0.92 LH_MIN_SEO=0.9 LH_MIN_BP=0.85
 */
import fs from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/assert-lighthouse-scores.mjs <lighthouse-report.json>");
  process.exit(2);
}

const raw = fs.readFileSync(path, "utf8");
const j = JSON.parse(raw);
const c = j.categories;
if (!c) {
  console.error("Invalid Lighthouse JSON: missing categories");
  process.exit(2);
}

const min = {
  performance: Number(process.env.LH_MIN_PERF ?? "0.55"),
  accessibility: Number(process.env.LH_MIN_A11Y ?? "0.92"),
  seo: Number(process.env.LH_MIN_SEO ?? "0.9"),
  bestPractices: Number(process.env.LH_MIN_BP ?? "0.85"),
};

const scores = {
  performance: c.performance?.score ?? 0,
  accessibility: c.accessibility?.score ?? 0,
  seo: c.seo?.score ?? 0,
  bestPractices: c["best-practices"]?.score ?? 0,
};

const failed = [];
for (const key of Object.keys(min)) {
  const v = scores[key];
  const floor = min[key];
  if (v < floor) {
    failed.push(`${key}: ${v.toFixed(3)} < ${floor}`);
  }
}

if (failed.length) {
  console.error("Lighthouse score assertions failed:");
  for (const line of failed) console.error(" -", line);
  console.error("\nFull scores:", JSON.stringify(scores, null, 2));
  process.exit(1);
}

console.log("Lighthouse thresholds OK:", JSON.stringify(scores, null, 2));
