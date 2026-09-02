#!/usr/bin/env node
/**
 * Effect v4 spike inventory — baseline metrics for staged migration (#1034).
 * Safe on v3 production branches; read-only.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = join(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const packagesDir = join(root, "packages");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function installedEffectVersion() {
  try {
    const pkg = require("effect/package.json");
    return pkg.version;
  } catch {
    return null;
  }
}

function rootEffectDeps() {
  const pkg = readJson(join(root, "package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.overrides };
  return Object.entries(deps)
    .filter(([k]) => k === "effect" || k.startsWith("@effect/"))
    .sort(([a], [b]) => a.localeCompare(b));
}

function walkTs(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== "node_modules" && ent.name !== "dist") walkTs(p, acc);
    else if (ent.name.endsWith(".ts") && !ent.name.endsWith(".test.ts")) acc.push(p);
  }
  return acc;
}

function countPattern(files, pattern) {
  let n = 0;
  for (const f of files) {
    if (pattern.test(readFileSync(f, "utf8"))) n++;
  }
  return n;
}

const workspacePackages = readdirSync(packagesDir)
  .filter((name) => existsSync(join(packagesDir, name, "package.json")))
  .sort();

const withEffect = [];
const withoutEffect = [];
for (const name of workspacePackages) {
  const pkg = readJson(join(packagesDir, name, "package.json"));
  const deps = { ...pkg.dependencies, ...pkg.peerDependencies };
  if (deps.effect) withEffect.push({ name, range: deps.effect });
  else withoutEffect.push(name);
}

const allPkgTs = workspacePackages.flatMap((name) => walkTs(join(packagesDir, name, "src")));
const rootTs = walkTs(join(root, "src"));
const allTs = [...allPkgTs, ...rootTs];

const contextTagFiles = countPattern(allTs, /Context\.Tag\s*\(/);
const effectSchemaFiles = countPattern(allTs, /from ["']effect\/Schema["']|Schema\.(Struct|String|Number)/);
const atEffectImports = countPattern(allTs, /from ["']@effect\//);

const report = {
  generatedAt: new Date().toISOString(),
  installedEffect: installedEffectVersion(),
  rootEffectDeps: Object.fromEntries(rootEffectDeps()),
  workspacePackageCount: workspacePackages.length,
  packagesWithEffect: withEffect.length,
  packagesWithoutEffect: withoutEffect,
  contextTagFileCount: contextTagFiles,
  effectSchemaFileCount: effectSchemaFiles,
  atEffectImportFileCount: atEffectImports,
  stage1Packages: ["clawql-core", "clawql-api"],
};

console.log("Effect v4 spike inventory\n");
console.log(`  Installed effect:     ${report.installedEffect ?? "(not installed)"}`);
console.log(`  Root effect deps:     ${JSON.stringify(report.rootEffectDeps)}`);
console.log(
  `  packages/* w/ effect: ${report.packagesWithEffect}/${report.workspacePackageCount}`
);
if (withoutEffect.length) {
  console.log(`  Missing effect:       ${withoutEffect.join(", ")}`);
}
console.log(`  Context.Tag files:    ${report.contextTagFileCount}`);
console.log(`  effect/Schema files:  ${report.effectSchemaFileCount}`);
console.log(`  @effect/* imports:    ${report.atEffectImportFileCount} files`);
console.log(`  Stage 1 targets:      ${report.stage1Packages.join(", ")}`);

if (process.env.EFFECT_V4_INVENTORY_JSON === "1") {
  console.log("\n" + JSON.stringify(report, null, 2));
}
