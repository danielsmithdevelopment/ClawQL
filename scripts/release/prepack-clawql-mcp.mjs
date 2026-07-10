#!/usr/bin/env node
/**
 * Prepare clawql-mcp for `npm pack` / `npm publish`:
 * - Pin workspace `clawql-*` deps to concrete semver (registry clients cannot resolve workspace:*).
 * - When CLAWQL_NPM_BUNDLE_WORKSPACE=1, add bundledDependencies (first npm release of split packages).
 * - Backup package.json for postpack restore (dev tree keeps workspace:*).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const pkgPath = join(root, "package.json");
const backupPath = join(root, ".package.json.prepack-backup");
const bundleWorkspace = process.env.CLAWQL_NPM_BUNDLE_WORKSPACE === "1";

const orderPath = join(root, "scripts/release/npm-publish-order.json");
const { packages: publishOrder } = JSON.parse(readFileSync(orderPath, "utf8"));

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
writeFileSync(backupPath, JSON.stringify(pkg, null, 4) + "\n");

const deps = { ...pkg.dependencies };
let pinned = 0;

for (const [name, spec] of Object.entries(deps)) {
  if (!name.startsWith("clawql-")) continue;
  if (spec !== "workspace:*" && /^\d/.test(String(spec))) continue;
  const wsPkgPath = join(root, "packages", name, "package.json");
  const wsPkg = JSON.parse(readFileSync(wsPkgPath, "utf8"));
  if (!wsPkg.version) {
    throw new Error(`prepack: missing version in ${wsPkgPath}`);
  }
  deps[name] = wsPkg.version;
  pinned += 1;
}

if (pinned > 0) {
  pkg.dependencies = deps;
}

if (bundleWorkspace) {
  const bundled = publishOrder.filter((name) => name !== "clawql-mcp");
  pkg.bundledDependencies = bundled;
  console.log(
    `prepack: bundle mode — ${bundled.length} clawql-* packages will ship inside clawql-mcp`,
  );
} else if (pkg.bundledDependencies) {
  delete pkg.bundledDependencies;
}

writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + "\n");

if (pinned === 0 && !bundleWorkspace) {
  console.log("prepack: clawql-* dependencies already pinned");
} else if (pinned > 0) {
  console.log(`prepack: pinned ${pinned} clawql-* workspace dependencies for publish`);
}
