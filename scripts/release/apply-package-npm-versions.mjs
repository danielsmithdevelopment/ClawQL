#!/usr/bin/env node
/**
 * Apply scripts/release/package-npm-version-targets.json to workspace package.json files.
 * Updates each package's `version` and pins workspace clawql-* / mcp-* dependency versions.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const targetsPath = join(root, "scripts/release/package-npm-version-targets.json");
const { inTreeTargets } = JSON.parse(readFileSync(targetsPath, "utf8"));

const workspaceNames = new Set(Object.keys(inTreeTargets));

function targetFor(name) {
  const v = inTreeTargets[name];
  if (!v) return undefined;
  return v;
}

function rewriteDeps(deps) {
  if (!deps || typeof deps !== "object") return false;
  let changed = false;
  for (const [name, current] of Object.entries(deps)) {
    const base = name.replace(/^@/, "").split("/").pop();
    const t = targetFor(name) ?? targetFor(base);
    if (!t) continue;
    const next = t;
    if (current !== next) {
      deps[name] = next;
      changed = true;
    }
  }
  return changed;
}

function processPackageJson(path, { isRoot = false } = {}) {
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  let changed = false;

  if (!isRoot && pkg.name && inTreeTargets[pkg.name] && pkg.version !== inTreeTargets[pkg.name]) {
    pkg.version = inTreeTargets[pkg.name];
    changed = true;
  }

  if (isRoot && pkg.name === "clawql-mcp" && pkg.version !== inTreeTargets["clawql-mcp"]) {
    pkg.version = inTreeTargets["clawql-mcp"];
    changed = true;
  }

  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    if (rewriteDeps(pkg[field])) changed = true;
  }

  if (changed) {
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`updated ${path.replace(root + "/", "")}`);
  }
  return changed;
}

let count = 0;
processPackageJson(join(root, "package.json"), { isRoot: true }) && count++;

const packagesDir = join(root, "packages");
for (const entry of readdirSync(packagesDir)) {
  const pkgPath = join(packagesDir, entry, "package.json");
  try {
    if (statSync(pkgPath).isFile() && processPackageJson(pkgPath)) count++;
  } catch {
    /* skip */
  }
}

console.log(`Done. ${count} package.json file(s) updated.`);
