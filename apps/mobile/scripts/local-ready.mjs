#!/usr/bin/env node
/**
 * Confirms the mobile app is usable locally without Apple/Google/EAS signup.
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
if (!String(pkg.scripts?.start ?? "").includes("CLAWQL_FIXTURE=1")) {
  fail("npm start must default to EXPO_PUBLIC_CLAWQL_FIXTURE=1");
}
ok("npm start defaults to fixture mode");

if (!existsSync(join(root, "app/sign-in.tsx"))) fail("missing sign-in screen");
const signIn = readFileSync(join(root, "app/sign-in.tsx"), "utf8");
if (!signIn.includes("sign-in-fixture")) fail("fixture sign-in button missing");
ok("fixture + reviewer-demo sign-in paths present");

if (!existsSync(join(root, "LOCAL.md"))) fail("LOCAL.md missing");
ok("LOCAL.md documents no-signup workflow");

for (const script of ["test", "typecheck"]) {
  const r = spawnSync("npm", ["run", script], { cwd: root, stdio: "inherit", shell: false });
  if (r.status !== 0) fail(`npm run ${script} failed`);
  ok(`npm run ${script}`);
}

console.log("\nLocal-ready: no Apple / Google / EAS signup required.");
console.log("Next: npm start → Continue with fixture session");
