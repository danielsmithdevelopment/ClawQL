#!/usr/bin/env node
/**
 * Audit 11.03 — thin www evidence path check (not full 9.08 codegen).
 *
 * Reads artifact / harness paths cited by apps/www/src/lib/*benchmarks*.ts
 * (and durability-benchmarks.ts) and fails if any repo-relative path is missing.
 *
 * Optionally spot-checks a few headline numbers against JSON evidence.
 *
 * Usage:
 *   node scripts/benchmarks/check-www-evidence-paths.mjs
 *   node scripts/benchmarks/check-www-evidence-paths.mjs --self-test
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const LIB_DIR = join(ROOT, "apps/www/src/lib");

/** Basename-only artifact* values resolve under these dirs per source file. */
const BARE_ARTIFACT_BASE = {
  "gateway-benchmarks.ts": "docs/benchmarks/gateway-multi-comparison",
};

/** Optional spot-checks: path → list of substrings that must appear in the file. */
const HEADLINE_SPOT_CHECKS = [
  {
    path: "docs/benchmarks/cloudflare-multiturn/board-summary-n10000-r3.json",
    needles: ["1710"],
    label: "cf known_op weighted tokens",
  },
  {
    path: "docs/benchmarks/gateway-multi-comparison/gateway-multi-multiturn.json",
    needles: ["8866"],
    label: "gateway ClawQL combined @12",
  },
];

function listBenchmarkLibFiles() {
  return readdirSync(LIB_DIR)
    .filter((n) => /benchmarks\.ts$/i.test(n) || n === "durability-benchmarks.ts")
    .map((n) => join(LIB_DIR, n))
    .sort();
}

/**
 * Collect repo-relative paths from a www lib source file.
 * - Full paths: 'docs/benchmarks/...' | 'scripts/benchmarks/...'
 * - Bare artifact*.json under BARE_ARTIFACT_BASE for that file
 */
function extractCitedPaths(absFile) {
  const text = readFileSync(absFile, "utf8");
  const fileName = basename(absFile);
  const cited = new Map(); // path -> reason

  const fullRe =
    /(['"])((?:docs|scripts)\/benchmarks\/[^'"]+)\1/g;
  let m;
  while ((m = fullRe.exec(text))) {
    const p = m[2].replace(/\/+$/, "") || m[2];
    // Keep trailing slash dirs as paths without slash for exists check of dir
    const normalized = m[2].endsWith("/") ? m[2].replace(/\/+$/, "") + "/" : m[2];
    cited.set(normalized, `literal in ${fileName}`);
  }

  const bareBase = BARE_ARTIFACT_BASE[fileName];
  if (bareBase) {
    const bareRe =
      /\b(artifact[A-Za-z0-9_]*)\s*:\s*['"]([A-Za-z0-9._-]+\.(?:json|md))['"]/g;
    while ((m = bareRe.exec(text))) {
      const rel = `${bareBase}/${m[2]}`;
      cited.set(rel, `${m[1]} basename in ${fileName}`);
    }
  }

  return cited;
}

function pathExists(repoRel) {
  const abs = join(ROOT, repoRel.replace(/\/+$/, ""));
  return existsSync(abs);
}

function runSelfTest() {
  const tmpMissing = "docs/benchmarks/__does-not-exist-audit-1103__.json";
  if (pathExists(tmpMissing)) {
    console.error("self-test failed: sentinel path unexpectedly exists");
    process.exit(2);
  }
  const known = "docs/benchmarks/governance-policy-depth/results-smoke.json";
  if (!pathExists(known)) {
    console.error(`self-test failed: expected fixture missing: ${known}`);
    process.exit(2);
  }
  console.log("check-www-evidence-paths self-test OK");
}

function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const files = listBenchmarkLibFiles();
  if (files.length === 0) {
    console.error(`No *benchmarks*.ts under ${relative(ROOT, LIB_DIR)}`);
    process.exit(2);
  }

  /** @type {Map<string, string>} */
  const all = new Map();
  for (const f of files) {
    for (const [p, reason] of extractCitedPaths(f)) {
      if (!all.has(p)) all.set(p, reason);
    }
  }

  const missing = [];
  const present = [];
  for (const [p, reason] of [...all.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (pathExists(p)) {
      present.push(p);
      console.log(`OK   ${p}`);
    } else {
      missing.push({ p, reason });
      console.error(`MISS ${p}  (${reason})`);
    }
  }

  const spotFails = [];
  for (const check of HEADLINE_SPOT_CHECKS) {
    const abs = join(ROOT, check.path);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      spotFails.push(`${check.label}: missing ${check.path}`);
      continue;
    }
    const body = readFileSync(abs, "utf8");
    for (const needle of check.needles) {
      if (!body.includes(needle)) {
        spotFails.push(`${check.label}: ${check.path} missing substring ${JSON.stringify(needle)}`);
      }
    }
  }

  console.log("");
  console.log(
    `Cited paths: ${all.size} · present ${present.length} · missing ${missing.length}`
  );
  if (spotFails.length) {
    console.error("Headline spot-check failures:");
    for (const f of spotFails) console.error(`  - ${f}`);
  } else {
    console.log(`Headline spot-checks: ${HEADLINE_SPOT_CHECKS.length} OK`);
  }

  if (missing.length || spotFails.length) {
    process.exit(1);
  }
}

main();
