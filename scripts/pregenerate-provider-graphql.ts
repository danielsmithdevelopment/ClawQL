/**
 * For each bundled provider with an on-disk spec, run @omnigraph/openapi and write:
 *   - introspection.json (for MCP execute field resolution without live introspection)
 *   - schema.graphql (SDL, for docs / review)
 *
 * Run after build + fetch-provider-specs:
 *   npm run build && npm run fetch-provider-specs && npm run pregenerate-graphql
 *
 * Some large specs (e.g. Jira) may fail translation; the script logs and continues.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { existsSync } from "node:fs";
import { introspectionFromSchema, printSchema } from "graphql";
import { buildGraphQLSchema } from "../src/graphql-schema-builder.js";
import {
  loadOpenAPIFromAbsolutePath,
  resolveApiBaseUrl,
} from "../src/spec-loader.js";
import { BUNDLED_PROVIDERS } from "../src/provider-registry.js";
import { getPackageRoot } from "../src/package-root.js";

async function main() {
  const root = getPackageRoot();
  if (!process.env.CLAWQL_API_BASE_URL?.trim()) {
    process.env.CLAWQL_API_BASE_URL = "https://example.com";
  }

  const only = process.env.CLAWQL_PREGENERATE_ONLY?.trim().toLowerCase();
  const entries = only
    ? Object.values(BUNDLED_PROVIDERS).filter((e) => e.id.toLowerCase() === only)
    : Object.values(BUNDLED_PROVIDERS);
  if (only && entries.length === 0) {
    console.error(
      `[pregenerate] Unknown CLAWQL_PREGENERATE_ONLY="${only}". ` +
        `Known: ${Object.keys(BUNDLED_PROVIDERS).join(", ")}`
    );
    process.exit(1);
  }
  if (only) {
    console.error(`[pregenerate] Single provider: ${only}`);
  }

  for (const entry of entries) {
    const specAbs = resolvePath(root, entry.bundledSpecPath);
    if (!existsSync(specAbs)) {
      console.warn(`[pregenerate] Skip ${entry.id}: missing ${specAbs} (run fetch-provider-specs)`);
      continue;
    }

    let openapi;
    try {
      const loaded = await loadOpenAPIFromAbsolutePath(specAbs);
      openapi = loaded.openapi;
    } catch (e) {
      console.warn(`[pregenerate] Skip ${entry.id}: load failed`, e);
      continue;
    }

    let baseUrl: string;
    try {
      baseUrl = resolveApiBaseUrl(openapi);
    } catch {
      baseUrl = process.env.CLAWQL_API_BASE_URL!;
    }

    try {
      const { schema } = await buildGraphQLSchema(
        openapi as unknown as object,
        baseUrl
      );
      const intro = introspectionFromSchema(schema);
      const sdl = printSchema(schema);
      const introPath = resolvePath(root, entry.bundledIntrospectionPath!);
      const sdlPath = resolvePath(root, entry.bundledSchemaSdlPath!);
      await mkdir(dirname(introPath), { recursive: true });
      await writeFile(introPath, JSON.stringify(intro), "utf-8");
      await writeFile(sdlPath, sdl, "utf-8");
      console.error(`[pregenerate] Wrote ${entry.id}: ${introPath}`);
    } catch (e) {
      console.warn(`[pregenerate] Skip ${entry.id}: GraphQL build failed`, e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
