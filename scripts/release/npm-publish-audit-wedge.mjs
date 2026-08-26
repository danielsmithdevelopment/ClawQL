#!/usr/bin/env node
/**
 * Publish the standalone WORM wedge only: clawql-merkle then clawql-audit.
 *
 * Use for first registry publish of merkle/audit@0.1.0 without re-tagging clawql-mcp.
 * Requires NPM_TOKEN and/or npm OIDC trusted publishing (packages must be linked
 * on npmjs.com for provenance / trusted publishers).
 *
 * Dry run: node scripts/release/npm-publish-audit-wedge.mjs --dry-run
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const dryRun = process.argv.includes("--dry-run");
const packages = ["clawql-merkle", "clawql-audit"];

function publish(workspace) {
  const cmd = `npm publish -w ${workspace} --provenance --access public`;
  if (dryRun) {
    console.log(`[dry-run] ${cmd}`);
    return;
  }
  console.log(`Publishing ${workspace}…`);
  execSync(cmd, { cwd: root, stdio: "inherit", env: process.env });
}

for (const name of packages) {
  publish(name);
}
console.log(
  dryRun ? "Dry run complete (clawql-merkle → clawql-audit)." : "Wedge publish complete."
);
