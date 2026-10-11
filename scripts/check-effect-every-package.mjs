#!/usr/bin/env node
/**
 * CI guard: every packages/* workspace must declare `effect` and export at least
 * one Context.Service (Effect v4; formerly Context.Tag) — Effect everywhere, one package.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const packagesDir = join(root, "packages");
const effectVersion = readFileSync(join(root, "package.json"), "utf8").match(
  /"effect":\s*"([^"]+)"/
)?.[1];

const failures = [];

for (const name of readdirSync(packagesDir).sort()) {
  const pkgDir = join(packagesDir, name);
  const pkgJsonPath = join(pkgDir, "package.json");
  if (!existsSync(pkgJsonPath)) continue;

  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.peerDependencies };
  if (!deps.effect) {
    failures.push(`${name}: missing "effect" in dependencies or peerDependencies`);
    continue;
  }

  const srcDir = join(pkgDir, "src");
  if (!existsSync(srcDir)) {
    failures.push(`${name}: no src/ directory`);
    continue;
  }

  let hasTag = false;
  const walk = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith(".ts") && !ent.name.endsWith(".test.ts")) {
        const text = readFileSync(p, "utf8");
        // Effect v4: Context.Service; accept legacy Context.Tag during partial migrations.
        if (/Context\.Service\s*</.test(text) || /Context\.Tag\s*\(/.test(text)) hasTag = true;
      }
    }
  };
  walk(srcDir);

  if (!hasTag) {
    failures.push(`${name}: no Context.Service found under src/`);
  }
}

if (failures.length) {
  console.error("Effect-every-package check failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    `\nEvery packages/* workspace must declare effect (${effectVersion ?? "4.0.0"}) and ship a Context.Service + Layer.`
  );
  process.exit(1);
}

console.log(
  "Effect-every-package: all workspace packages declare effect and export Context.Service services."
);