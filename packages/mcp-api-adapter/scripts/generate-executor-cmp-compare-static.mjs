#!/usr/bin/env node
/**
 * Pre-render executor-cmp-001 compare flamegraph as static HTML for clawql.com
 * and docs.clawql.com (no live mcp-api-adapter process required).
 *
 * Run: npm run build -w mcp-api-adapter && node packages/mcp-api-adapter/scripts/generate-executor-cmp-compare-static.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildContextFlamegraph,
  DEMO_TRACE_SESSION_EXECUTOR_CMP_CLAWQL,
  DEMO_TRACE_SESSION_EXECUTOR_CMP_EXECUTOR,
  demoExecutorCmpRecords,
  executorCmpTraceTokenizationMeta,
  buildExecutorCmpComparePageOpts,
  executorCmpJsonEnvelope,
} from "../dist/mcp-ui-trace.js";
import { renderTraceComparePage } from "../dist/mcp-ui-trace-html.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");

const CANONICAL = "https://clawql.com/mcp-ui/trace/compare/executor";
const DOCS_CATALOG = "https://docs.clawql.com/mcp/mcp-ui";
const METHODOLOGY = "https://docs.clawql.com/benchmarks/executor-comparison";

const OUT_DIRS = [
  join(ROOT, "website", "public", "mcp-ui", "trace", "compare", "executor"),
  join(ROOT, "landing-page", "demo", "public", "mcp-ui", "trace", "compare", "executor"),
];

function patchStaticHtml(html) {
  return html
    .replace(
      `<p class="fg-nav"><a href="/mcp-ui/">← MCP UI catalog</a></p>`,
      `<p class="fg-nav"><a href="${DOCS_CATALOG}">← MCP UI docs</a> · <a href="${METHODOLOGY}">Methodology</a> · <a href="${CANONICAL}">canonical URL</a></p>`
    )
    .replace(
      `<link rel="canonical" href="/mcp-ui/trace/compare/executor"/>`,
      `<link rel="canonical" href="${CANONICAL}"/>`
    )
    .replace(
      `${CANONICAL}?format=json`,
      `${CANONICAL.replace("/executor", "/executor/compare.json")}`
    );
}

async function main() {
  const { clawql, executor } = demoExecutorCmpRecords("executor-cmp-compare-static");
  const tok = executorCmpTraceTokenizationMeta();
  const cGraph = buildContextFlamegraph(DEMO_TRACE_SESSION_EXECUTOR_CMP_CLAWQL, clawql, {
    tokenization: tok,
  });
  const eGraph = buildContextFlamegraph(DEMO_TRACE_SESSION_EXECUTOR_CMP_EXECUTOR, executor, {
    tokenization: tok,
  });
  const opts = {
    ...buildExecutorCmpComparePageOpts("/mcp-ui", "input"),
    canonicalPath: CANONICAL,
  };
  const html = patchStaticHtml(renderTraceComparePage(cGraph, eGraph, opts));
  const json = JSON.stringify(executorCmpJsonEnvelope("input", cGraph, eGraph), null, 2);

  for (const dir of OUT_DIRS) {
    await mkdir(dir, { recursive: true });
    const htmlPath = join(dir, "index.html");
    const jsonPath = join(dir, "compare.json");
    await writeFile(htmlPath, html, "utf8");
    await writeFile(jsonPath, json, "utf8");
    console.log("Wrote", htmlPath);
    console.log("Wrote", jsonPath);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
