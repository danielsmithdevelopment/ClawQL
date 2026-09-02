#!/usr/bin/env node
/**
 * Download tailcat release binaries into packages/clawql-network/tailcat/bin/.
 * Requires network access. Skips assets that are already present.
 */
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const binDir = join(__dirname, "../../packages/clawql-network/tailcat/bin");
const repo = process.env.CLAWQL_TAILCAT_RELEASE_REPO ?? "tailscale/tailcat";
const tag = process.env.CLAWQL_TAILCAT_RELEASE_TAG ?? "latest";

const ASSETS = [
  "tailcat-linux-amd64",
  "tailcat-linux-arm64",
  "tailcat-darwin-arm64",
  "tailcat-windows-amd64.exe",
];

async function githubReleaseAssets() {
  const url =
    tag === "latest"
      ? `https://api.github.com/repos/${repo}/releases/latest`
      : `https://api.github.com/repos/${repo}/releases/tags/${tag}`;
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "clawql-network-fetch" },
  });
  if (!res.ok) {
    throw new Error(`GitHub release lookup failed (${res.status}) for ${repo}@${tag}`);
  }
  const body = (await res.json()) as { assets?: Array<{ name: string; browser_download_url: string }> };
  return new Map((body.assets ?? []).map((a) => [a.name, a.browser_download_url]));
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download failed ${res.status} ${url}`);
  await pipeline(res.body, createWriteStream(dest));
}

async function main() {
  await mkdir(binDir, { recursive: true });
  let assets;
  try {
    assets = await githubReleaseAssets();
  } catch (err) {
    console.warn("fetch-tailcat-binaries:", err instanceof Error ? err.message : err);
    console.warn("Keeping tailcat-dev.mjs shim; set CLAWQL_TAILCAT_BIN or install tailcat on PATH.");
    process.exit(0);
  }

  for (const name of ASSETS) {
    const url = assets.get(name);
    if (!url) {
      console.warn(`skip missing asset: ${name}`);
      continue;
    }
    const dest = join(binDir, name);
    console.log(`downloading ${name}…`);
    await download(url, dest);
    if (!name.endsWith(".exe")) {
      await chmod(dest, 0o755);
    }
  }
  console.log("tailcat binaries ready in", binDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
