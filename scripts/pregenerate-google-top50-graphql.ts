/**
 * For each providers/google/apis/<slug>/discovery.json, run @omnigraph/openapi and write:
 *   introspection.json, schema.graphql
 *
 * Run after build + fetch-google-top50:
 *   npm run build && npm run fetch-google-top50 && npm run pregenerate-google-top50-graphql
 * (Uses `tsx` via npm script — same runtime as `npm run dev`.)
 */
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { existsSync } from "node:fs";
import { introspectionFromSchema, printSchema } from "graphql";
import { buildGraphQLSchema } from "../src/graphql-schema-builder.js";
import {
  loadOpenAPIFromAbsolutePath,
  resolveApiBaseUrl,
} from "../src/spec-loader.js";
import { getPackageRoot } from "../src/package-root.js";

const APIS_ROOT = "providers/google/apis";

async function main() {
  const root = getPackageRoot();
  if (!process.env.CLAWQL_API_BASE_URL?.trim()) {
    process.env.CLAWQL_API_BASE_URL = "https://example.com";
  }

  const apisDir = resolvePath(root, APIS_ROOT);
  if (!existsSync(apisDir)) {
    console.error(`[pregenerate-top50] Missing ${APIS_ROOT} — run npm run fetch-google-top50`);
    process.exit(1);
  }

  const entries = await readdir(apisDir, { withFileTypes: true });
  const slugs = entries.filter((d) => d.isDirectory()).map((d) => d.name);
  slugs.sort();

  for (const slug of slugs) {
    const specAbs = resolvePath(apisDir, slug, "discovery.json");
    if (!existsSync(specAbs)) {
      console.warn(`[pregenerate-top50] Skip ${slug}: no discovery.json`);
      continue;
    }

    let openapi;
    try {
      const loaded = await loadOpenAPIFromAbsolutePath(specAbs);
      openapi = loaded.openapi;
    } catch (e) {
      console.warn(`[pregenerate-top50] Skip ${slug}: load failed`, e);
      continue;
    }

    let baseUrl;
    try {
      baseUrl = resolveApiBaseUrl(openapi);
    } catch {
      baseUrl = process.env.CLAWQL_API_BASE_URL;
    }

    try {
      const { schema } = await buildGraphQLSchema(
        openapi,
        baseUrl
      );
      const intro = introspectionFromSchema(schema);
      const sdl = printSchema(schema);
      const introPath = resolvePath(apisDir, slug, "introspection.json");
      const sdlPath = resolvePath(apisDir, slug, "schema.graphql");
      await mkdir(dirname(introPath), { recursive: true });
      await writeFile(introPath, JSON.stringify(intro), "utf-8");
      await writeFile(sdlPath, sdl, "utf-8");
      console.error(`[pregenerate-top50] Wrote ${slug}`);
    } catch (e) {
      console.warn(`[pregenerate-top50] Skip ${slug}: GraphQL build failed`, e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
