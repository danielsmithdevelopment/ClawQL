#!/usr/bin/env node
/**
 * Lightweight preflight for App Store / Play submission packaging.
 * Does not call Apple/Google APIs — verifies in-repo store readiness.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function ok(msg) {
  console.log(`✓ ${msg}`);
}
function bad(msg) {
  console.error(`✗ ${msg}`);
  failed += 1;
}
function warn(msg) {
  console.warn(`! ${msg}`);
}

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

const requiredFiles = [
  "store/DAY0-CHECKLIST.md",
  "store/review-notes.md",
  "store/privacy/apple-privacy-labels.md",
  "store/privacy/play-data-safety.md",
  "store/privacy/privacy-policy.md",
  "well-known/apple-app-site-association",
  "well-known/assetlinks.json",
  "eas.json",
  "app.config.ts",
  "maestro/flows/mob-01-sign-in-fixture.yaml",
  "maestro/flows/mob-06-sign-out.yaml",
];

for (const rel of requiredFiles) {
  if (existsSync(join(root, rel))) ok(`present ${rel}`);
  else bad(`missing ${rel}`);
}

const eas = readJson("eas.json");
const asc = eas?.submit?.production?.ios?.ascAppId;
if (!asc || String(asc).includes("REPLACE")) {
  warn("eas.json submit.production.ios.ascAppId still placeholder (human Day-0)");
} else {
  ok(`ascAppId set (${asc})`);
}

const aasa = readFileSync(join(root, "well-known/apple-app-site-association"), "utf8");
if (aasa.includes("TEAMID")) {
  warn("apple-app-site-association still contains TEAMID placeholder");
} else {
  ok("AASA Team ID looks filled");
}

const assetlinks = readFileSync(join(root, "well-known/assetlinks.json"), "utf8");
if (/REPLACE_WITH_|00:11:22:33|CHANGEME/i.test(assetlinks)) {
  warn("assetlinks.json still has placeholder fingerprint");
} else {
  ok("assetlinks fingerprint looks filled");
}

const pkg = readJson("package.json");
if (pkg.version !== "0.1.0") ok(`package version ${pkg.version}`);
else ok("package version 0.1.0 (first store track)");

if (failed > 0) {
  console.error(`\nstore-check failed (${failed} error(s))`);
  process.exit(1);
}
console.log("\nstore-check OK — remaining Day-0 items are human enrollment / hosting.");
