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
const { packages } = JSON.parse(
  readFileSync(join(root, "scripts/release/npm-publish-order.json"), "utf8"),
);

function publishCmd(workspace) {
  return `npm publish -w ${workspace} --provenance --access public`;
}

function tryPublish(workspace) {
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
  execSync(`npm publish "${tarball}" --provenance --access public`, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
}

let bundleWorkspace = forceBundle;

if (!bundleWorkspace) {
  for (const name of packages) {
    if (name === "clawql-mcp") continue;
    console.log(`Publishing ${name}…`);
    const result = tryPublish(name);
    if (!result.ok) {
      console.warn(
        `WARN: ${name} publish failed (${result.reason}). ` +
          "Falling back to bundled clawql-mcp — add NPM_TOKEN or link trusted publishers on npmjs.com, then re-run to publish workspace packages separately.",
      );
      bundleWorkspace = true;
      break;
    }
  }
}

publishClawqlMcp(bundleWorkspace);
console.log(dryRun ? "Dry run complete." : "Publish complete.");
