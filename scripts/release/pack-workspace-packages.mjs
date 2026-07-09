#!/usr/bin/env node
/**
 * Pack all clawql-* workspace packages in topological publish order.
 * Used by CI smoke tests before registry publish.
 *
 * Usage: node scripts/release/pack-workspace-packages.mjs [output-dir]
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const orderPath = join(root, "scripts/release/npm-publish-order.json");
const { packages } = JSON.parse(readFileSync(orderPath, "utf8"));
const outDir = process.argv[2] ?? join(root, ".pack-workspace");

mkdirSync(outDir, { recursive: true });

const tarballs = [];
for (const name of packages) {
  if (name === "clawql-mcp") continue;
  execSync(`npm pack -w ${name} --pack-destination "${outDir}"`, {
    cwd: root,
    stdio: "inherit",
  });
  tarballs.push(name);
}

console.log(`pack-workspace-packages: wrote ${tarballs.length} tarballs to ${outDir}`);
