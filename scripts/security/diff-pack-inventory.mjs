#!/usr/bin/env node
/**
 * Diff two clawql-pack-inventory/v1 JSON files (release BOM drift).
 *
 * Usage:
 *   node scripts/security/diff-pack-inventory.mjs <baseline.json> <current.json>
 *
 * Flags:
 *   --strict              fail on any added/removed/changed package
 *   --max-added N
 *   --max-removed N
 *   --max-changed N       packages present in both with different sha256/contentId
 *   --json
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--") && !a.includes(" ")));
const flagVal = (name, fallback) => {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const v = process.argv[idx + 1];
  return v === undefined || v.startsWith("--") ? fallback : Number(v);
};

if (positional.length < 2) {
  console.error(
    "Usage: node scripts/security/diff-pack-inventory.mjs <baseline.json> <current.json> [--strict] [--max-added N] [--max-removed N] [--max-changed N]",
  );
  process.exit(2);
}

const baseline = JSON.parse(readFileSync(resolve(positional[0]), "utf8"));
const current = JSON.parse(readFileSync(resolve(positional[1]), "utf8"));

const byName = (inv) => {
  const m = new Map();
  for (const p of inv.packages ?? []) m.set(p.name, p);
  return m;
};

const bMap = byName(baseline);
const cMap = byName(current);

const added = [...cMap.keys()].filter((k) => !bMap.has(k)).sort();
const removed = [...bMap.keys()].filter((k) => !cMap.has(k)).sort();
const changed = [...cMap.keys()]
  .filter((k) => bMap.has(k))
  .filter((k) => {
    const a = bMap.get(k);
    const b = cMap.get(k);
    return a.sha256 !== b.sha256 || a.contentId !== b.contentId || a.version !== b.version;
  })
  .sort();

const changedDetails = changed.map((name) => ({
  name,
  from: {
    version: bMap.get(name).version,
    sha256: bMap.get(name).sha256,
    contentId: bMap.get(name).contentId,
  },
  to: {
    version: cMap.get(name).version,
    sha256: cMap.get(name).sha256,
    contentId: cMap.get(name).contentId,
  },
}));

const summary = {
  baselinePackages: bMap.size,
  currentPackages: cMap.size,
  addedCount: added.length,
  removedCount: removed.length,
  changedCount: changed.length,
  addedNames: added,
  removedNames: removed,
  changedDetails,
};

if (flags.has("--json")) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log("Pack inventory diff");
  console.log(`  baseline: ${summary.baselinePackages} packages`);
  console.log(`  current:  ${summary.currentPackages} packages`);
  console.log(`  added:    ${summary.addedCount}`);
  console.log(`  removed:  ${summary.removedCount}`);
  console.log(`  changed:  ${summary.changedCount}`);
  for (const n of added) console.log(`    + ${n}`);
  for (const n of removed) console.log(`    - ${n}`);
  for (const c of changedDetails) {
    console.log(
      `    ~ ${c.name}: ${c.from.version}→${c.to.version} sha ${c.from.sha256.slice(0, 12)}…→${c.to.sha256.slice(0, 12)}…`,
    );
  }
}

const maxAdded = flagVal("--max-added", flags.has("--strict") ? 0 : Number.POSITIVE_INFINITY);
const maxRemoved = flagVal("--max-removed", flags.has("--strict") ? 0 : Number.POSITIVE_INFINITY);
const maxChanged = flagVal("--max-changed", flags.has("--strict") ? 0 : Number.POSITIVE_INFINITY);

let exit = 0;
if (added.length > maxAdded) {
  console.error(`diff-pack-inventory: ${added.length} added exceeds --max-added ${maxAdded}`);
  exit = 1;
}
if (removed.length > maxRemoved) {
  console.error(`diff-pack-inventory: ${removed.length} removed exceeds --max-removed ${maxRemoved}`);
  exit = 1;
}
if (changed.length > maxChanged) {
  console.error(`diff-pack-inventory: ${changed.length} changed exceeds --max-changed ${maxChanged}`);
  exit = 1;
}

process.exit(exit);
