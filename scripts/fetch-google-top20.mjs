#!/usr/bin/env node
/**
 * Download Discovery JSON for the curated list in providers/google/google-top20-apis.json
 * into providers/google/apis/<slug>/discovery.json
 *
 * Run: node scripts/fetch-google-top20.mjs
 */
import { mkdir, writeFile, copyFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(root, "providers/google/google-top20-apis.json");
const BUNDLED_CONTAINER = join(root, "providers/google/discovery.json");

async function main() {
  const raw = await readFile(MANIFEST, "utf-8");
  const manifest = JSON.parse(raw);
  const apis = manifest.apis;
  if (!Array.isArray(apis) || apis.length === 0) {
    throw new Error("google-top20-apis.json: missing apis[]");
  }

  const outBase = join(root, "providers/google/apis");
  await mkdir(outBase, { recursive: true });

  const fetchedAt = new Date().toISOString();
  let copied = 0;

  for (const api of apis) {
    const { slug, id, discoveryRestUrl } = api;
    if (!slug || !discoveryRestUrl) {
      throw new Error(`Invalid api entry: ${JSON.stringify(api)}`);
    }
    const dir = join(outBase, slug);
    const outFile = join(dir, "discovery.json");
    await mkdir(dir, { recursive: true });

    if (id === "container:v1" && existsSync(BUNDLED_CONTAINER)) {
      await copyFile(BUNDLED_CONTAINER, outFile);
      copied++;
      process.stderr.write(`[copy] ${slug} ← providers/google/discovery.json\n`);
      continue;
    }

    process.stderr.write(`[fetch] ${slug} (${id}) …\n`);
    const res = await fetch(discoveryRestUrl);
    if (!res.ok) {
      throw new Error(`${slug}: HTTP ${res.status} ${discoveryRestUrl}`);
    }
    const text = await res.text();
    await writeFile(outFile, text, "utf-8");
  }

  const meta = {
    fetchedAt,
    sourceManifest: "providers/google/google-top20-apis.json",
    count: apis.length,
    containerCopiedFromBundled: copied > 0,
  };
  await writeFile(
    join(outBase, "manifest-meta.json"),
    JSON.stringify(meta, null, 2) + "\n",
    "utf-8"
  );

  process.stderr.write(
    `Wrote ${apis.length} discovery.json files under providers/google/apis/\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
