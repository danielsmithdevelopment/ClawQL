#!/usr/bin/env node
/**
 * Prepare clawql-mcp for `npm pack` / `npm publish`:
 * - Pin workspace `clawql-*` deps to concrete semver (registry clients cannot resolve workspace:*).
 * - Backup package.json for postpack restore (dev tree keeps workspace:*).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const pkgPath = join(root, "package.json");
const backupPath = join(root, ".package.json.prepack-backup");

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
writeFileSync(backupPath, JSON.stringify(pkg, null, 4) + "\n");

const deps = { ...pkg.dependencies };
let pinned = 0;

for (const [name, spec] of Object.entries(deps)) {
  if (!name.startsWith("clawql-")) continue;
  if (spec !== "workspace:*" && /^\d/.test(String(spec))) continue;
  const wsPkgPath = join(root, "packages", name, "package.json");
  const wsPkg = JSON.parse(readFileSync(wsPkgPath, "utf8"));
  if (!wsPkg.version) {
    throw new Error(`prepack: missing version in ${wsPkgPath}`);
  }
  deps[name] = wsPkg.version;
  pinned += 1;
}

if (pinned === 0) {
  console.log("prepack: clawql-* dependencies already pinned");
} else {
  pkg.dependencies = deps;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + "\n");
  console.log(`prepack: pinned ${pinned} clawql-* workspace dependencies for publish`);
}
