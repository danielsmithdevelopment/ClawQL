#!/usr/bin/env node
/**
 * Publish clawql-* workspace packages in topological order, then clawql-mcp.
 *
 * First-time 7.x: workspace package names may not exist on npm yet. OIDC trusted
 * publishing only works for packages already linked on npmjs.com. When a workspace
 * publish returns 404, fall back to a single clawql-mcp tarball with
 * bundledDependencies (same install story as 6.4.x).
 *
 * Requires NPM_TOKEN (NODE_AUTH_TOKEN) and/or npm OIDC trusted publishing.
 *
 * Dry run: node scripts/release/npm-publish-workspace.mjs --dry-run
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const dryRun = process.argv.includes("--dry-run");
const forceBundle = process.env.CLAWQL_NPM_BUNDLE_WORKSPACE === "1";
const order = JSON.parse(
  readFileSync(join(root, "scripts/release/npm-publish-order.json"), "utf8"),
);
const packages = order.packages ?? [];
const extras = order.localPackExtras ?? [];

function publishCmd(workspace) {
  return `npm publish -w ${workspace} --provenance --access public`;
}

function tryPublish(workspace, { softFail = false } = {}) {
  const cmd = publishCmd(workspace);
  if (dryRun) {
    console.log(`[dry-run] ${cmd}`);
    return { ok: true };
  }
  try {
    execSync(cmd, { cwd: root, stdio: "pipe", env: process.env, encoding: "utf8" });
    return { ok: true };
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}${error.message ?? ""}`;
    if (output.includes("E404") || output.includes("404 Not Found")) {
      return { ok: false, reason: "404", output };
    }
    // Own-cadence extras (and first-time clawql-* names) may lack OIDC / NPM_TOKEN.
    // Soft-fail so clawql-mcp can still publish (bundled or registry-linked).
    if (
      softFail &&
      (output.includes("ENEEDAUTH") ||
        output.includes("need auth") ||
        output.includes("EOTP") ||
        output.includes("403 Forbidden") ||
        output.includes("EPUBLISHCONFLICT") ||
        output.includes("cannot publish over"))
    ) {
      return { ok: false, reason: "auth-or-conflict", output };
    }
    if (output) process.stderr.write(output);
    throw error;
  }
}

function publishClawqlMcp(bundleWorkspace) {
  if (bundleWorkspace) {
    process.env.CLAWQL_NPM_BUNDLE_WORKSPACE = "1";
    console.log(
      "Publishing clawql-mcp with bundledDependencies (workspace packages not on registry yet).",
    );
  } else {
    console.log("Publishing clawql-mcp (root)…");
  }

  if (dryRun) {
    console.log("[dry-run] npm pack + npm publish clawql-mcp-*.tgz");
    return;
  }

  const packDir = join(root, ".npm-publish-pack");
  execSync(`mkdir -p "${packDir}" && npm pack --pack-destination "${packDir}"`, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  const tarball = execSync(`find "${packDir}" -maxdepth 1 -name 'clawql-mcp-*.tgz' -print -quit`, {
    encoding: "utf8",
  }).trim();
  if (!tarball) throw new Error("npm pack did not produce clawql-mcp tarball");
  try {
    execSync(`npm publish "${tarball}" --provenance --access public`, {
      cwd: root,
      stdio: "pipe",
      env: process.env,
      encoding: "utf8",
    });
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}${error.message ?? ""}`;
    if (
      output.includes("EPUBLISHCONFLICT") ||
      output.includes("cannot publish over") ||
      output.includes("403 Forbidden")
    ) {
      console.warn(
        "WARN: clawql-mcp publish skipped (already published or auth). Workspace packages above still apply.",
      );
      if (output) process.stderr.write(`${output}\n`);
      return;
    }
    if (output) process.stderr.write(output);
    throw error;
  }
}

let bundleWorkspace = forceBundle;

// Own-cadence packages first (e.g. mcp-grpc-transport@1.0.0) when OIDC/token allows.
// localPackExtras are for pack-smoke + optional publish — never abort the clawql-mcp release.
if (!bundleWorkspace) {
  for (const name of extras) {
    console.log(`Publishing ${name} (localPackExtras)…`);
    const result = tryPublish(name, { softFail: true });
    if (!result.ok) {
      console.warn(
        `WARN: ${name} publish failed (${result.reason}). ` +
          "Skipping (own cadence / not linked for OIDC). Continuing with clawql-* packages.",
      );
      if (result.output) process.stderr.write(`${result.output}\n`);
    }
  }
}

if (!bundleWorkspace) {
  for (const name of packages) {
    if (name === "clawql-mcp") continue;
    console.log(`Publishing ${name}…`);
    const result = tryPublish(name, { softFail: true });
    if (!result.ok) {
      console.warn(
        `WARN: ${name} publish failed (${result.reason}). ` +
          "Continuing remaining packages; clawql-mcp may use bundledDependencies if any workspace package is missing.",
      );
      if (result.output && result.reason !== "404") process.stderr.write(`${result.output}\n`);
      bundleWorkspace = true;
    }
  }
}

publishClawqlMcp(bundleWorkspace);
console.log(dryRun ? "Dry run complete." : "Publish complete.");
