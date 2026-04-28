#!/usr/bin/env node
/**
 * Fetch the official Google API Discovery directory (all public Google APIs).
 * Source: https://www.googleapis.com/discovery/v1/apis
 *
 * Writes:
 * - providers/google/discovery-directory.json — verbatim directoryList (for tools)
 * - providers/google/google-apis-lookup.json — slim index (id → discoveryRestUrl, docs, etc.)
 *
 * Run from repo root: node scripts/providers/fetch-google-discovery-directory.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://www.googleapis.com/discovery/v1/apis";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(root, "providers/google");
const OUT_RAW = join(OUT_DIR, "discovery-directory.json");
const OUT_LOOKUP = join(OUT_DIR, "google-apis-lookup.json");

function slimItem(item) {
  return {
    id: item.id,
    name: item.name,
    version: item.version,
    title: item.title,
    description: item.description ?? "",
    preferred: Boolean(item.preferred),
    discoveryRestUrl: item.discoveryRestUrl,
    documentationLink: item.documentationLink ?? "",
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  process.stderr.write(`Fetching ${SOURCE_URL}\n`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data || typeof data !== "object" || !Array.isArray(data.items)) {
    throw new Error("Unexpected directory response shape (expected items[]).");
  }

  const fetchedAt = new Date().toISOString();
  await writeFile(OUT_RAW, JSON.stringify(data, null, 2) + "\n", "utf-8");

  const apis = data.items.map(slimItem).sort((a, b) => a.id.localeCompare(b.id));
  const lookup = {
    source: SOURCE_URL,
    fetchedAt,
    kind: data.kind,
    discoveryVersion: data.discoveryVersion,
    count: apis.length,
    preferredCount: apis.filter((a) => a.preferred).length,
    apis,
  };
  await writeFile(OUT_LOOKUP, JSON.stringify(lookup, null, 2) + "\n", "utf-8");

  process.stderr.write(
    `Wrote ${OUT_RAW} and ${OUT_LOOKUP} (${apis.length} APIs, ${lookup.preferredCount} preferred).\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
