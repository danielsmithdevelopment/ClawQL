#!/usr/bin/env node
/**
 * Pack all clawql-* workspace packages in topological publish order.
 * Also packs `localPackExtras` (e.g. mcp-grpc-transport) for CI smoke before registry publish.
 *
 * Usage: node scripts/release/pack-workspace-packages.mjs [output-dir]
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const orderPath = join(root, "scripts/release/npm-publish-order.json");
const order = JSON.parse(readFileSync(orderPath, "utf8"));
const packages = order.packages ?? [];
const extras = order.localPackExtras ?? [];
const extrasAfter = order.localPackExtrasAfter ?? [];
const outDir = process.argv[2] ?? join(root, ".pack-workspace");

mkdirSync(outDir, { recursive: true });

const tarballs = [];
for (const name of [...extras, ...packages, ...extrasAfter]) {
  if (name === "clawql-mcp") continue;
  execSync(`npm pack -w ${name} --pack-destination "${outDir}"`, {
    cwd: root,
    stdio: "inherit",
  });
  tarballs.push(name);
}

console.log(`pack-workspace-packages: wrote ${tarballs.length} tarballs to ${outDir}`);
