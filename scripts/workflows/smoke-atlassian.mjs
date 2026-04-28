#!/usr/bin/env node
/**
 * Smoke test: Jira bundled provider — local spec, workflow-oriented search queries.
 *
 *   npm run build && node scripts/workflows/smoke-atlassian.mjs
 *
 * Validates `search`-style scoring against the OpenAPI (no live Jira API).
 */

process.env.CLAWQL_PROVIDER = "jira";
process.env.CLAWQL_API_BASE_URL = "https://example.atlassian.net";
process.env.CLAWQL_BUNDLED_OFFLINE = "1";

const { loadSpec, resetSpecCache } = await import("../../dist/spec-loader.js");
const { preloadSchemaFieldCacheFromDisk } = await import("../../dist/tools.js");
const { searchOperations, formatSearchResults } = await import(
  "../../dist/spec-search.js"
);

/** Workflow the user cares about: project setup, people, labels, dates, edits */
const SCENARIOS = [
  {
    name: "Create a new project",
    query: "create new project",
  },
  {
    name: "Add users / roles to a project",
    query: "add user project role members",
  },
  {
    name: "Labels / tags on issues",
    query: "label field issue",
  },
  // Due dates are usually `fields.duedate` on edit issue — rarely a REST op named "due date".
  {
    name: "Deadline / due date (via issue fields)",
    query: "edit issue fields",
  },
  {
    name: "Update description or body",
    query: "update issue description",
  },
];

/** One combined natural-language query (like an agent might send) */
const COMBINED_QUERY =
  "create a new jira project add users to it set labels tags due date deadline update issue description";

resetSpecCache();
const { operations } = await loadSpec();
const preloaded = await preloadSchemaFieldCacheFromDisk();

console.log("=== ClawQL Jira smoke (search over bundled OpenAPI) ===\n");
console.log(`Operations indexed: ${operations.length}`);
console.log(`Pregenerated introspection on disk: ${preloaded}\n`);

for (const { name, query } of SCENARIOS) {
  const hits = searchOperations(operations, query, 5);
  console.log(`--- ${name} ---`);
  console.log(`Query: "${query}"`);
  console.log(`Hits: ${hits.length}`);
  if (hits.length === 0) {
    console.log("(no matches)\n");
    continue;
  }
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const op = h.operation;
    const desc =
      op.description.length > 160
        ? `${op.description.slice(0, 157)}…`
        : op.description;
    console.log(
      `  ${i + 1}. [${op.method}] ${op.id}\n     path: ${op.flatPath}\n     score: ${h.score}  (${h.matchedOn.join(", ")})\n     ${desc.replace(/\s+/g, " ").trim()}`
    );
  }
  console.log("");
}

console.log("--- Combined narrative query ---");
console.log(`Query: "${COMBINED_QUERY}"`);
const combined = searchOperations(operations, COMBINED_QUERY, 8);
console.log(formatSearchResults(combined));

console.log(
  JSON.stringify(
    {
      ok: true,
      bundledOffline: true,
      operationCount: operations.length,
      introspectionPreloadedFromDisk: preloaded,
      scenarios: SCENARIOS.map(({ name, query }) => ({
        name,
        query,
        topHitId: searchOperations(operations, query, 1)[0]?.operation?.id ?? null,
      })),
    },
    null,
    2
  )
);
