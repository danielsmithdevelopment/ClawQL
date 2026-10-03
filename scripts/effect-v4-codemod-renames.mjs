#!/usr/bin/env node
/**
 * Safe mechanical Effect v3 → v4 renames (string replace).
 * Does NOT rewrite Schema modules (handled separately).
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const roots = [join(root, "packages"), join(root, "src"), join(root, "apps"), join(root, "scripts")];

const replacements = [
  // Order matters — longer first
  [/Effect\.catchAllCause\b/g, "Effect.catchCause"],
  [/Effect\.catchAllDefect\b/g, "Effect.catchDefect"],
  [/Effect\.catchAll\b/g, "Effect.catch"],
  [/Effect\.catchSomeCause\b/g, "Effect.catchCauseFilter"],
  [/Effect\.catchSome\b/g, "Effect.catchFilter"],
  // orElse → catch with ignored error is API-shape change; only rename
  // Effect.orElseFail → mapError is also shape change. Leave those for compile errors.
];

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name === ".next") continue;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

let files = 0;
let hits = 0;
for (const f of roots.flatMap((r) => walk(r))) {
  let src = readFileSync(f, "utf8");
  let n = 0;
  for (const [re, to] of replacements) {
    const before = src;
    src = src.replace(re, () => {
      n++;
      return to;
    });
    if (src === before && n === 0) {
      /* noop */
    }
  }
  if (n > 0) {
    writeFileSync(f, src);
    files++;
    hits += n;
    console.log(`${f.replace(root + "/", "")}: ${n}`);
  }
}
console.log(`\nUpdated ${files} files (${hits} renames).`);
