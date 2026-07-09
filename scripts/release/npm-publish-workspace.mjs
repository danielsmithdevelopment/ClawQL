#!/usr/bin/env node
/**
 * Publish clawql-* workspace packages in topological order, then clawql-mcp.
 * Requires NPM_TOKEN or npm OIDC trusted publishing on the repo.
 *
 * Dry run: node scripts/release/npm-publish-workspace.mjs --dry-run
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const dryRun = process.argv.includes("--dry-run");
const { packages } = JSON.parse(
  readFileSync(join(root, "scripts/release/npm-publish-order.json"), "utf8"),
);

const publish = (workspace) => {
  const cmd = `npm publish -w ${workspace} --provenance --access public`;
  if (dryRun) {
    console.log(`[dry-run] ${cmd}`);
    return;
  }
  execSync(cmd, { cwd: root, stdio: "inherit", env: process.env });
};

for (const name of packages) {
  if (name === "clawql-mcp") continue;
  console.log(`Publishing ${name}…`);
  publish(name);
}

console.log("Publishing clawql-mcp (root)…");
if (dryRun) {
  console.log("[dry-run] npm pack + npm publish clawql-mcp-*.tgz");
} else {
  const packDir = join(root, ".npm-publish-pack");
  execSync(`mkdir -p "${packDir}" && npm pack --pack-destination "${packDir}"`, {
    cwd: root,
    stdio: "inherit",
  });
  const tarball = execSync(`find "${packDir}" -maxdepth 1 -name 'clawql-mcp-*.tgz' -print -quit`, {
    encoding: "utf8",
  }).trim();
  if (!tarball) throw new Error("npm pack did not produce clawql-mcp tarball");
  execSync(`npm publish "${tarball}" --provenance --access public`, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
}

console.log(dryRun ? "Dry run complete." : "All packages published.");
