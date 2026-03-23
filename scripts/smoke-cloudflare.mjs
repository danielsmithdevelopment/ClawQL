#!/usr/bin/env node
/**
 * Smoke test: Cloudflare bundled provider — load full OpenAPI, run search (no live API).
 *
 *   npm run build && node scripts/smoke-cloudflare.mjs
 *
 * The full Cloudflare spec is large (~tens of MB). GraphQL pregeneration may fail
 * with @omnigraph/openapi; `execute` can still use REST fallback when GraphQL is unavailable.
 */

process.env.CLAWQL_PROVIDER = "cloudflare";
process.env.CLAWQL_API_BASE_URL = "https://api.cloudflare.com/client/v4";
process.env.CLAWQL_BUNDLED_OFFLINE = "1";

const { loadSpec, resetSpecCache } = await import("../dist/spec-loader.js");
const { searchOperations, formatSearchResults } = await import(
  "../dist/spec-search.js"
);

const QUERY = "list dns records for a zone";

resetSpecCache();
const { operations } = await loadSpec();

console.log("=== ClawQL Cloudflare smoke (search over bundled OpenAPI) ===\n");
console.log(`Operations indexed: ${operations.length}\n`);

const hits = searchOperations(operations, QUERY, 5);
console.log(`Query: "${QUERY}"\n`);
console.log(formatSearchResults(hits));

console.log(
  JSON.stringify(
    {
      ok: true,
      bundledOffline: true,
      operationCount: operations.length,
      topHit: hits[0]?.operation?.id ?? null,
    },
    null,
    2
  )
);
