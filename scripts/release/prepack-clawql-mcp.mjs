#!/usr/bin/env node
/**
 * Prepare clawql-mcp for `npm pack` / `npm publish`:
 * - Pin workspace clawql-* deps to concrete semver (registry clients cannot resolve workspace:*).
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

const workspaceNames = new Set(pkg.bundledDependencies ?? []);
const deps = { ...pkg.dependencies };

for (const name of workspaceNames) {
  const wsPkgPath = join(root, "packages", name, "package.json");
  const wsPkg = JSON.parse(readFileSync(wsPkgPath, "utf8"));
  if (!wsPkg.version) {
    throw new Error(`prepack: missing version in ${wsPkgPath}`);
  }
  deps[name] = wsPkg.version;
}

pkg.dependencies = deps;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + "\n");
console.log("prepack: pinned bundled clawql-* dependencies for publish");
