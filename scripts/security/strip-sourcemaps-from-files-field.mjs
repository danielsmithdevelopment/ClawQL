#!/usr/bin/env node
// Policy: published artifacts must NOT include source maps.
// Inserts npm files-field negation for dist source maps into each package.json
// that lists "dist". Local builds may still emit maps for debugging.
//
// Usage: node scripts/security/strip-sourcemaps-from-files-field.mjs [--check]
//   --check  exit 1 if any package still packs maps (no write)
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const checkOnly = process.argv.includes("--check");
const NEG = "!dist/" + "**/" + "*.map";

function candidates() {
  const out = [join(root, "package.json")];
  for (const name of readdirSync(join(root, "packages"))) {
    const p = join(root, "packages", name, "package.json");
    if (existsSync(p)) out.push(p);
  }
  return out;
}

let changed = 0;
let missing = 0;

for (const pkgPath of candidates()) {
  const raw = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  if (!Array.isArray(pkg.files) || !pkg.files.includes("dist")) continue;
  if (pkg.files.includes(NEG)) continue;
  missing += 1;
  if (checkOnly) {
    console.error(`missing ${NEG} in ${pkgPath}`);
    continue;
  }
  const idx = pkg.files.indexOf("dist");
  pkg.files.splice(idx + 1, 0, NEG);
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`updated ${pkgPath}`);
  changed += 1;
}

if (checkOnly) {
  if (missing > 0) {
    console.error(`strip-sourcemaps-from-files-field --check: ${missing} package(s) lack negation`);
    process.exit(1);
  }
  console.log("strip-sourcemaps-from-files-field --check: ok");
  process.exit(0);
}

console.log(`strip-sourcemaps-from-files-field: updated ${changed} package.json file(s)`);
