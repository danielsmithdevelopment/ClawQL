#!/usr/bin/env node
/**
 * Confirms desktop is usable locally without code-signing / store accounts.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
function ok(msg) {
  console.log(`✓ ${msg}`);
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (!pkg.scripts?.dev) fail("npm run dev missing");
if (!pkg.scripts?.["dev:managed"]) fail("npm run dev:managed missing (managed Review fixture)");
ok("dev + dev:managed scripts present");

if (!pkg.build?.protocols?.some((p) => p.schemes?.includes("clawql"))) {
  fail("electron-builder protocols must include clawql");
}
ok("clawql:// protocol registered in packaging");

if (!existsSync(join(root, "src/deeplink.mjs"))) fail("deeplink.mjs missing");
ok("PhoneApprove deeplink parser present");

if (!existsSync(join(root, "LOCAL.md"))) fail("LOCAL.md missing");
ok("LOCAL.md documents no-signing workflow");

const r = spawnSync("npm", ["test"], { cwd: root, stdio: "inherit", shell: false });
if (r.status !== 0) fail("npm test failed");
ok("npm test");

console.log("\nLocal-ready: no Apple / Windows / Linux signing required.");
console.log("PhoneApprove queue: CLAWQL_DESKTOP_MANAGED_FIXTURE=1 npm run dev:managed");
