#!/usr/bin/env node
/**
 * Reproducible token benchmark (README "Provider benchmark breakdown").
 *
 * - **Phase 1:** full `JSON.stringify(openapi)` vs `formatSearchResults(top 5)` — numbers only in md.
 * - **Phase 2:** **Full REST response JSON** (unfiltered body) vs **GraphQL response JSON** (field-selected
 *   payload) — token estimates + side-by-side excerpts. Default: **committed fixtures** in
 *   `docs/benchmarks/response-examples/` (no credentials). Optional: **`BENCHMARK_LIVE=1`** runs real
 *   REST + in-process GraphQL and uses live bodies when both succeed.
 *
 * Secondary metrics (JSON only): OpenAPI response schema size vs field-selection string — documentation
 * cost, not execution payload size.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs", "benchmarks");
const FIXTURE_DIR = join(ROOT, "docs", "benchmarks", "response-examples");

const CHARS_PER_TOKEN = 4;

function estimateTokens(text) {
  return Math.round(String(text).length / CHARS_PER_TOKEN);
}

const EXCERPT_CHARS = 900;

function excerpt(text, maxChars = EXCERPT_CHARS) {
  const s = String(text);
  if (s.length <= maxChars) {
    return { text: s, truncated: false, totalChars: s.length };
  }
  return {
    text: `${s.slice(0, maxChars)}\n… [truncated; ${s.length} chars total]`,
    truncated: true,
    totalChars: s.length,
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wantLive() {
  const v = process.env.BENCHMARK_LIVE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function loadFixture(provider) {
  try {
    const text = await readFile(
      join(FIXTURE_DIR, `${provider}.json`),
      "utf-8"
    );
    const j = JSON.parse(text);
    if (j.fullRest == null || j.graphql == null) return null;
    return {
      fullRestStr: JSON.stringify(j.fullRest, null, 2),
      graphqlStr: JSON.stringify(j.graphql, null, 2),
    };
  } catch {
    return null;
  }
}

const CASES = [
  {
    provider: "google",
    query:
      "create gke kubernetes cluster with node pools, then fetch cluster details and endpoint",
    operationId: "container.projects.locations.clusters.list",
    fields:
      "clusters { name status endpoint selfLink } nextPageToken",
    liveArgs: () => {
      const parent = process.env.BENCHMARK_GOOGLE_PARENT?.trim();
      if (!parent) return null;
      const m = parent.match(/^projects\/([^/]+)\/locations\/([^/]+)$/);
      if (!m) return null;
      return {
        parent,
        projectsId: m[1],
        locationsId: m[2],
      };
    },
  },
  {
    provider: "jira",
    query:
      "create issue in project, assign owner, set highest priority, due date, labels, then update description",
    operationId:
      "com.atlassian.jira.rest.v2.issue.IssueResource.getIssue_get",
    fields: "id key self summary",
    liveArgs: () => {
      const issueIdOrKey = process.env.BENCHMARK_JIRA_ISSUE_KEY?.trim();
      if (!issueIdOrKey) return null;
      return { issueIdOrKey };
    },
  },
  {
    provider: "cloudflare",
    query:
      "create a DNS record with proxy enabled, set ttl and tags, then list and filter records by name and content",
    operationId: "dns-records-for-a-zone-list-dns-records",
    fields:
      "result { id name type content proxied ttl } result_info { page per_page total_count } success errors { code message }",
    liveArgs: () => {
      const zone_id = process.env.BENCHMARK_CLOUDFLARE_ZONE_ID?.trim();
      if (!zone_id) return null;
      return { zone_id };
    },
  },
];

async function main() {
  if (process.env.CLAWQL_BUNDLED_OFFLINE === undefined) {
    process.env.CLAWQL_BUNDLED_OFFLINE = "1";
  }

  const { loadSpec, resetSpecCache, resolveApiBaseUrl } = await import(
    join(ROOT, "dist", "spec-loader.js")
  );
  const { searchOperations, formatSearchResults } = await import(
    join(ROOT, "dist", "spec-search.js")
  );

  const live = wantLive();
  const restModule = live
    ? await import(join(ROOT, "dist", "rest-operation.js"))
    : null;
  const gqlModule = live
    ? await import(join(ROOT, "dist", "graphql-in-process-execute.js"))
    : null;
  const executeRestOperation = restModule?.executeRestOperation;
  const executeOperationGraphQL = gqlModule?.executeOperationGraphQL;

  const runAt = new Date().toISOString();
  const results = [];

  for (const c of CASES) {
    process.env.CLAWQL_PROVIDER = c.provider;
    resetSpecCache();

    const { openapi, operations } = await loadSpec();

    const fullSpecString = JSON.stringify(openapi);
    const fullSpecTokens = estimateTokens(fullSpecString);

    const hits = searchOperations(operations, c.query, 5);
    const searchText = formatSearchResults(hits);
    const top5SearchPayloadTokens = estimateTokens(searchText);

    const phase1TokensSaved = fullSpecTokens - top5SearchPayloadTokens;
    const phase1Multiplier = +(fullSpecTokens / top5SearchPayloadTokens).toFixed(
      2
    );
    const phase1PercentReduction = +(
      (100 * phase1TokensSaved) /
      fullSpecTokens
    ).toFixed(2);

    let baseUrl;
    try {
      baseUrl = resolveApiBaseUrl(openapi);
    } catch {
      baseUrl = "https://placeholder.invalid";
    }

    const op = operations.find((o) => o.id === c.operationId) ?? null;

    const schemaName = op?.responseBody ?? null;
    const schemaObj =
      schemaName && openapi.components?.schemas?.[schemaName]
        ? openapi.components.schemas[schemaName]
        : null;
    const responseSchemaTokens = schemaObj
      ? estimateTokens(JSON.stringify(schemaObj))
      : null;
    const selectedFieldsTokens = estimateTokens(c.fields);
    const phase2DocSaved =
      responseSchemaTokens != null
        ? responseSchemaTokens - selectedFieldsTokens
        : null;

    const rawArgs = typeof c.liveArgs === "function" ? c.liveArgs() : null;

    let fullRestStr = null;
    let graphqlStr = null;
    let phase2Source = "none";
    let restError = null;
    let graphqlError = null;

    if (live && op && rawArgs && executeRestOperation && executeOperationGraphQL) {
      const restExec = await executeRestOperation(op, rawArgs, openapi);
      if (restExec.ok) {
        fullRestStr = JSON.stringify(restExec.data, null, 2);
      } else {
        restError = restExec.error;
      }

      const gqlExec = await executeOperationGraphQL(
        openapi,
        baseUrl,
        op,
        rawArgs,
        c.fields
      );
      if (gqlExec.ok) {
        graphqlStr = JSON.stringify(gqlExec.data, null, 2);
      } else {
        graphqlError = gqlExec.error;
      }

      if (fullRestStr && graphqlStr) {
        phase2Source = "live";
      } else {
        phase2Source = "live_partial";
      }
    }

    if (!fullRestStr || !graphqlStr) {
      const fx = await loadFixture(c.provider);
      if (fx) {
        if (!fullRestStr) fullRestStr = fx.fullRestStr;
        if (!graphqlStr) graphqlStr = fx.graphqlStr;
        if (phase2Source === "none" || phase2Source === "live_partial") {
          phase2Source =
            phase2Source === "live_partial"
              ? "fixture_supplemented"
              : "fixture";
        }
      }
    }

    const fullRestTokens = fullRestStr ? estimateTokens(fullRestStr) : null;
    const graphqlResponseTokens = graphqlStr
      ? estimateTokens(graphqlStr)
      : null;
    const phase2PayloadSaved =
      fullRestTokens != null && graphqlResponseTokens != null
        ? fullRestTokens - graphqlResponseTokens
        : null;
    const phase2PayloadMultiplier =
      fullRestTokens && graphqlResponseTokens
        ? +(fullRestTokens / graphqlResponseTokens).toFixed(2)
        : null;
    const phase2PayloadPercentReduction =
      fullRestTokens != null && phase2PayloadSaved != null
        ? +((100 * phase2PayloadSaved) / fullRestTokens).toFixed(2)
        : null;

    const p2Before = fullRestStr != null ? excerpt(fullRestStr) : null;
    const p2After = graphqlStr != null ? excerpt(graphqlStr) : null;

    results.push({
      provider: c.provider,
      query: c.query,
      operationId: op?.id ?? c.operationId,
      responseSchema: schemaName,
      fullSpecTokens,
      top5SearchPayloadTokens,
      phase1TokensSaved,
      phase1Multiplier,
      phase1PercentReduction,
      phase1BeforeChars: fullSpecString.length,
      phase1AfterChars: searchText.length,
      phase2Documentation: {
        responseSchemaTokens,
        selectedFieldsTokens,
        tokensSaved: phase2DocSaved,
      },
      phase2Payload: {
        source: phase2Source,
        fullRestTokens,
        graphqlResponseTokens,
        tokensSaved: phase2PayloadSaved,
        multiplier: phase2PayloadMultiplier,
        percentReduction: phase2PayloadPercentReduction,
        restError,
        graphqlError,
      },
      sideBySide: {
        phase2:
          p2Before && p2After
            ? {
                beforeChars: p2Before.totalChars,
                beforePreview: p2Before.text,
                afterChars: p2After.totalChars,
                afterPreview: p2After.text,
                source: phase2Source,
              }
            : null,
      },
    });
  }

  const n = results.length;
  const avgPhase1Before = Math.round(
    results.reduce((s, r) => s + r.fullSpecTokens, 0) / n
  );
  const avgPhase1After = Math.round(
    results.reduce((s, r) => s + r.top5SearchPayloadTokens, 0) / n
  );
  const avgPhase1Saved = Math.round(
    results.reduce((s, r) => s + r.phase1TokensSaved, 0) / n
  );

  const withPayload = results.filter(
    (r) => r.phase2Payload.fullRestTokens != null
  );
  const avgRest = Math.round(
    withPayload.reduce((s, r) => s + r.phase2Payload.fullRestTokens, 0) /
      withPayload.length
  );
  const avgGql = Math.round(
    withPayload.reduce(
      (s, r) => s + r.phase2Payload.graphqlResponseTokens,
      0
    ) / withPayload.length
  );
  const avgPayloadSaved = Math.round(
    withPayload.reduce((s, r) => s + (r.phase2Payload.tokensSaved ?? 0), 0) /
      withPayload.length
  );

  const payload = {
    meta: {
      runAt,
      charsPerToken: CHARS_PER_TOKEN,
      method:
        "Phase 1: full OpenAPI JSON vs top-5 search payload. Phase 2: full REST response body vs GraphQL response body (execution payload). Default bodies from docs/benchmarks/response-examples; BENCHMARK_LIVE=1 replaces with real calls when both succeed. Phase 1 raw dumps omitted from markdown.",
      excerptChars: EXCERPT_CHARS,
      bundledOffline: process.env.CLAWQL_BUNDLED_OFFLINE === "1",
      benchmarkLive: live,
      fixtureDir: "docs/benchmarks/response-examples",
    },
    providers: results,
    averages: {
      phase1: {
        fullSpecTokensAvg: avgPhase1Before,
        top5SearchPayloadTokensAvg: avgPhase1After,
        tokensSavedAvg: avgPhase1Saved,
        percentReductionAvg: +(
          (100 * avgPhase1Saved) /
          avgPhase1Before
        ).toFixed(2),
      },
      phase2Payload: {
        fullRestTokensAvg: avgRest,
        graphqlResponseTokensAvg: avgGql,
        tokensSavedAvg: avgPayloadSaved,
        percentReductionAvg:
          avgRest > 0
            ? +((100 * avgPayloadSaved) / avgRest).toFixed(2)
            : null,
      },
    },
  };

  await mkdir(OUT_DIR, { recursive: true });
  const jsonPath = join(OUT_DIR, "latest.json");
  await writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf-8");

  const mdLines = [
    `<!-- generated by scripts/benchmark-provider-tokens.mjs at ${runAt} -->`,
    ``,
    `## Summary table`,
    ``,
    `| Provider | Complex query | Operation | Phase 1 (input) | Phase 2 (full REST JSON → GraphQL JSON) |`,
    `|---|---|---|---|---|`,
  ];
  for (const r of results) {
    const p1 = `${r.fullSpecTokens} → ${r.top5SearchPayloadTokens} (**${r.phase1TokensSaved} saved**, ${r.phase1Multiplier}x, ${r.phase1PercentReduction}%)`;
    const p2p = r.phase2Payload;
    const p2 =
      p2p.fullRestTokens != null && p2p.graphqlResponseTokens != null
        ? `${p2p.fullRestTokens} → ${p2p.graphqlResponseTokens} (**${p2p.tokensSaved} saved**, ${p2p.multiplier}x, ${p2p.percentReduction}%)`
        : "n/a";
    mdLines.push(
      `| \`${r.provider}\` | ${JSON.stringify(r.query)} | \`${r.operationId}\` | ${p1} | ${p2} |`
    );
  }
  mdLines.push(``);
  mdLines.push(
    `**Averages:** Phase 1 \`${payload.averages.phase1.fullSpecTokensAvg} → ${payload.averages.phase1.top5SearchPayloadTokensAvg}\` (**~${payload.averages.phase1.tokensSavedAvg} saved**, ~${payload.averages.phase1.percentReductionAvg}%); Phase 2 (REST body → GraphQL body) \`${payload.averages.phase2Payload.fullRestTokensAvg} → ${payload.averages.phase2Payload.graphqlResponseTokensAvg}\` (**~${payload.averages.phase2Payload.tokensSavedAvg} saved**, ~${payload.averages.phase2Payload.percentReductionAvg}%).`
  );
  mdLines.push(``);
  mdLines.push(
    `*Phase 2 uses representative JSON in \`docs/benchmarks/response-examples/\` unless \`BENCHMARK_LIVE=1\` returns real responses. JSON also records doc-only schema vs field-string cost under \`phase2Documentation\`.*`
  );

  mdLines.push(``);
  mdLines.push(`## Side-by-side (Phase 2) — full REST response vs GraphQL response`);
  mdLines.push(``);
  mdLines.push(
    `**Before** = typical **full REST** JSON body (everything the endpoint returns). **After** = **GraphQL-layer** JSON for the same operation with the benchmark’s field selection (what MCP \`execute\` returns). Offline runs use committed **fixtures**; set \`BENCHMARK_LIVE=1\` + provider env (see REPRODUCE.md) for **live** bodies. Previews truncate at **${EXCERPT_CHARS}** chars.`
  );
  mdLines.push(``);

  for (const r of results) {
    const sb = r.sideBySide?.phase2;
    const p2p = r.phase2Payload;
    mdLines.push(`### \`${r.provider}\``);
    mdLines.push(``);
    if (sb) {
      const src =
        p2p.source === "live"
          ? "live API"
          : p2p.source === "fixture"
            ? "fixture (`docs/benchmarks/response-examples/`)"
            : p2p.source === "fixture_supplemented"
              ? "fixture + partial live (one call failed)"
              : p2p.source === "live_partial"
                ? "partial live (using fixture for missing)"
                : "unknown";
      mdLines.push(`*Source: **${src}***`);
      if (p2p.restError) {
        mdLines.push(`*REST error:* \`${escapeHtml(p2p.restError.slice(0, 200))}\``);
      }
      if (p2p.graphqlError) {
        mdLines.push(
          `*GraphQL error:* \`${escapeHtml(p2p.graphqlError.slice(0, 200))}\``
        );
      }
      mdLines.push(``);
      mdLines.push(
        `<table><thead><tr><th>Before — full REST JSON (<code>${sb.beforeChars}</code> chars)</th><th>After — GraphQL JSON (<code>${sb.afterChars}</code> chars)</th></tr></thead><tbody><tr><td valign="top"><pre><code>${escapeHtml(sb.beforePreview)}</code></pre></td><td valign="top"><pre><code>${escapeHtml(sb.afterPreview)}</code></pre></td></tr></tbody></table>`
      );
    } else {
      mdLines.push(`*Could not load REST + GraphQL JSON for this provider.*`);
    }
    mdLines.push(``);
  }

  await writeFile(join(OUT_DIR, "latest.md"), mdLines.join("\n"), "utf-8");

  console.log(JSON.stringify(payload, null, 2));
  console.error(`\nWrote ${jsonPath} and docs/benchmarks/latest.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
