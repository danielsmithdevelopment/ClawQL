#!/usr/bin/env node
/**
 * Download OpenAPI YAML for the curated list in providers/aws/aws-top50-apis.json
 * into providers/aws/apis/<slug>/openapi.yaml
 *
 * Source: APIs.guru (community aws2openapi conversion of AWS SDK service models).
 *
 * Run: node scripts/providers/fetch-aws-top50.mjs
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST = join(root, "providers/aws/aws-top50-apis.json");

async function main() {
  const raw = await readFile(MANIFEST, "utf-8");
  const manifest = JSON.parse(raw);
  const apis = manifest.apis;
  if (!Array.isArray(apis) || apis.length === 0) {
    throw new Error("aws-top50-apis.json: missing apis[]");
  }

  const outBase = join(root, "providers/aws/apis");
  await mkdir(outBase, { recursive: true });

  const fetchedAt = new Date().toISOString();

  for (const api of apis) {
    const { slug, id, openapiUrl } = api;
    if (!slug || !openapiUrl) {
      throw new Error(`Invalid api entry: ${JSON.stringify(api)}`);
    }
    const dir = join(outBase, slug);
    const outFile = join(dir, "openapi.yaml");
    await mkdir(dir, { recursive: true });

    process.stderr.write(`[fetch] ${slug} (${id}) …\n`);
    const res = await fetch(openapiUrl);
    if (!res.ok) {
      throw new Error(`${slug}: HTTP ${res.status} ${openapiUrl}`);
    }
    const text = await res.text();
    await writeFile(outFile, text, "utf-8");
  }

  const lookup = apis.map((a) => ({
    slug: a.slug,
    id: a.id,
    version: a.version,
    title: a.title,
    openapiUrl: a.openapiUrl,
    documentationLink: a.documentationLink,
    bundledPath: `providers/aws/apis/${a.slug}/openapi.yaml`,
  }));

  await writeFile(
    join(root, "providers/aws/aws-apis-lookup.json"),
    JSON.stringify({ fetchedAt, apis: lookup }, null, 2) + "\n",
    "utf-8"
  );

  const meta = {
    fetchedAt,
    sourceManifest: "providers/aws/aws-top50-apis.json",
    count: apis.length,
  };
  await writeFile(
    join(outBase, "manifest-meta.json"),
    JSON.stringify(meta, null, 2) + "\n",
    "utf-8"
  );

  process.stderr.write(`Wrote ${apis.length} openapi.yaml files under providers/aws/apis/\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
