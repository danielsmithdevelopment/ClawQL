#!/usr/bin/env node
/**
 * CI gate: every IsolationBackend pin must use an OSI-allowlisted SPDX license.
 * Source of truth: packages/clawql-sandbox/src/isolation-backend/license-registry.ts
 *
 * Usage: node scripts/check-isolation-backend-licenses.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = join(
  root,
  "packages/clawql-sandbox/src/isolation-backend/license-registry.ts"
);

const ALLOWLIST = new Set([
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "MIT",
  "ISC",
  "MPL-2.0",
]);

const FORBIDDEN_IDS = new Set(["cua", "tart"]);

const src = readFileSync(registryPath, "utf8");

const allowlistMatch = src.match(
  /ISOLATION_OSI_LICENSE_ALLOWLIST\s*=\s*\[([\s\S]*?)\]\s*as const/
);
if (!allowlistMatch) {
  console.error("FAIL: could not find ISOLATION_OSI_LICENSE_ALLOWLIST");
  process.exit(1);
}

const allowlistFromFile = [...allowlistMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
for (const id of allowlistFromFile) {
  if (!ALLOWLIST.has(id)) {
    console.error(`FAIL: allowlist entry ${id} not in CI hard allowlist — update both`);
    process.exit(1);
  }
}

const pinBlocks = [...src.matchAll(/\{\s*id:\s*"([^"]+)"[\s\S]*?licenseSpdx:\s*"([^"]+)"/g)];
if (pinBlocks.length === 0) {
  console.error("FAIL: no isolation backend pins parsed");
  process.exit(1);
}

const violations = [];
for (const [, id, license] of pinBlocks) {
  if (FORBIDDEN_IDS.has(id)) {
    violations.push(`${id}: forbidden backend id`);
  }
  if (!ALLOWLIST.has(license)) {
    violations.push(`${id}: license ${license} not OSI-allowlisted`);
  }
}

if (/trycua|@trycua\/cua|Cua Spaces/i.test(src)) {
  violations.push("registry still references Cua — remove");
}

if (violations.length) {
  console.error("Isolation backend license check FAILED:");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log(
  `OK: ${pinBlocks.length} isolation backend pin(s); licenses in {${[...ALLOWLIST].join(", ")}}`
);
for (const [, id, license] of pinBlocks) {
  console.log(`  - ${id}: ${license}`);
}
