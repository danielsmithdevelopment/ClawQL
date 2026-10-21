#!/usr/bin/env node
/**
 * Diff two CycloneDX JSON SBOMs (Syft output). Reports added/removed components
 * by purl (fallback: name@version).
 *
 * Usage:
 *   node scripts/security/diff-sbom.mjs <baseline.cdx.json> <current.cdx.json>
 *
 * Env / flags:
 *   --strict          exit 1 if any component added or removed
 *   --max-added N     exit 1 if added count > N (default: unlimited unless --strict)
 *   --max-removed N   exit 1 if removed count > N
 *   --json            print machine-readable summary on stdout
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const flagVal = (name, fallback) => {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const v = process.argv[idx + 1];
  return v === undefined || v.startsWith("--") ? fallback : Number(v);
};

if (args.length < 2) {
  console.error(
    "Usage: node scripts/security/diff-sbom.mjs <baseline.cdx.json> <current.cdx.json> [--strict] [--max-added N] [--max-removed N] [--json]",
  );
  process.exit(2);
}

const baselinePath = resolve(args[0]);
const currentPath = resolve(args[1]);

function componentKey(c) {
  if (c.purl) return c.purl;
  const ver = c.version ? `@${c.version}` : "";
  return `${c.name || c["bom-ref"] || "?"}${ver}`;
}

function loadKeys(path) {
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const comps = doc.components ?? [];
  const keys = new Set(comps.map(componentKey));
  return { keys, count: comps.length, doc };
}

const baseline = loadKeys(baselinePath);
const current = loadKeys(currentPath);

const added = [...current.keys].filter((k) => !baseline.keys.has(k)).sort();
const removed = [...baseline.keys].filter((k) => !current.keys.has(k)).sort();

const summary = {
  baseline: { path: baselinePath, components: baseline.count },
  current: { path: currentPath, components: current.count },
  added: added.length,
  removed: removed.length,
  addedSample: added.slice(0, 40),
  removedSample: removed.slice(0, 40),
};

if (flags.has("--json")) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`SBOM diff`);
  console.log(`  baseline: ${baseline.count} components (${baselinePath})`);
  console.log(`  current:  ${current.count} components (${currentPath})`);
  console.log(`  added:    ${added.length}`);
  console.log(`  removed:  ${removed.length}`);
  if (added.length) {
    console.log(`  + sample:`);
    for (const k of summary.addedSample) console.log(`    + ${k}`);
    if (added.length > summary.addedSample.length) {
      console.log(`    … ${added.length - summary.addedSample.length} more`);
    }
  }
  if (removed.length) {
    console.log(`  - sample:`);
    for (const k of summary.removedSample) console.log(`    - ${k}`);
    if (removed.length > summary.removedSample.length) {
      console.log(`    … ${removed.length - summary.removedSample.length} more`);
    }
  }
}

const maxAdded = flagVal("--max-added", flags.has("--strict") ? 0 : Number.POSITIVE_INFINITY);
const maxRemoved = flagVal(
  "--max-removed",
  flags.has("--strict") ? 0 : Number.POSITIVE_INFINITY,
);

let exit = 0;
if (added.length > maxAdded) {
  console.error(`diff-sbom: ${added.length} added exceeds --max-added ${maxAdded}`);
  exit = 1;
}
if (removed.length > maxRemoved) {
  console.error(`diff-sbom: ${removed.length} removed exceeds --max-removed ${maxRemoved}`);
  exit = 1;
}

process.exit(exit);
