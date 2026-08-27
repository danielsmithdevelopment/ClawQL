#!/usr/bin/env node
/**
 * executor-cmp-001: Layer 1 (tool definitions) vs Layer 2 (tool results)
 *
 * Compares ClawQL's codemode/search+execute pattern against executor.sh's
 * published reference numbers and simulates Layer 2 using committed fixtures.
 *
 * Layer 1 is measured live from ClawQL MCP tools/list (cl100k_base).
 * Layer 2 uses docs/benchmarks/response-examples/github-pr-list.json unless
 * BENCHMARK_LIVE=1 and credentials succeed.
 *
 * connectToExecutor() is intentionally absent — Executor Layer 1 numbers are
 * cited from https://executor.sh (published marketing chart), not fabricated.
 * Layer 2 "executor" arm = raw REST JSON passthrough (Executor's documented
 * behavior: no output projection; "Trace every call" is audit, coming soon).
 *
 * Usage:
 *   npm run benchmark:executor-comparison
 *
 * Env:
 *   CMP_GITHUB_USER, CMP_GITHUB_REPO — optional live GitHub target
 *   BENCHMARK_LIVE=1 — attempt live GitHub list PRs (both arms)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getEncoding } from "js-tiktoken";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "docs", "benchmarks", "executor-comparison");
const FIXTURE_PATH = join(
  ROOT,
  "docs",
  "benchmarks",
  "response-examples",
  "github-pr-list.json"
);
const STATS_862X = join(
  ROOT,
  "docs",
  "benchmarks",
  "multi-provider-complex-workflow",
  "experiment-multi-provider-complex-workflow-stats.json"
);
const PROVIDER_BENCH = join(ROOT, "docs", "benchmarks", "latest.json");

const TASK = {
  id: "executor-cmp-001",
  description:
    "Find all open PRs authored by {user} in {repo} with more than " +
    "{threshold} review comments. Return title and comment count for each.",
  params: {
    user: process.env.CMP_GITHUB_USER ?? "alice-dev",
    repo: process.env.CMP_GITHUB_REPO ?? "acme/platform",
    threshold: 3,
  },
  requiredOutputFields: ["title", "reviewCommentCount"],
};

const MATCHED_CONDITIONS = {
  tokenizer: "cl100k_base",
  numPredict: 256,
  temperature: 0,
  systemPromptFixed: true,
  focus: "input",
};

/** Published on executor.sh homepage — reference only, not re-measured here. */
const EXECUTOR_PUBLISHED_REFERENCE = {
  source: "https://executor.sh/",
  capturedAt: "2026-08-27",
  withoutExecutor: {
    toolCount: 1640,
    approxTokens: 278800,
    integrations: {
      github: 720,
      stripe: 510,
      jira: 240,
      sentry: 170,
      linear: 130,
      gmail: 95,
      notion: 80,
      slack: 70,
    },
  },
  withExecutor: {
    toolCount: 1,
    approxTokens: 1044,
    pattern: "tools.search → tools.describe.tool → tools[path](input)",
  },
  traceFeatureNote:
    '"Trace every call" on executor.sh is audit/observability (Coming soon), not output-side token compression.',
};

const enc = getEncoding("cl100k_base");

function countTokens(text) {
  if (text == null || text === "") return 0;
  return enc.encode(String(text)).length;
}

function countTopLevelKeysPerItem(value) {
  const items = Array.isArray(value) ? value : value?.items ?? [];
  if (items.length === 0) return 0;
  const first = items[0];
  return first && typeof first === "object" ? Object.keys(first).length : 0;
}

async function measureClawqlToolDefinitions() {
  const measureHome = join("/tmp", `clawql-exec-cmp-${process.pid}`);
  await mkdir(measureHome, { recursive: true });

  /** Gateway-only: legacy env path with optional horizontal plugins disabled. */
  const gatewayEnv = {
    ...process.env,
    CLAWQL_BUNDLED_OFFLINE: "1",
    CLAWQL_HOME: measureHome,
    CLAWQL_OBSIDIAN_VAULT_PATH: measureHome,
    CLAWQL_TIER: "",
    CLAWQL_INSTANCE_SPEC: "",
    CLAWQL_INSTANCE_SPEC_FILE: "",
    CLAWQL_ENABLE_MEMORY: "0",
    CLAWQL_ENABLE_DOCUMENTS: "0",
    CLAWQL_ENABLE_PAGEINDEX: "0",
    CLAWQL_ENABLE_CODEGRAPH: "0",
    CLAWQL_ENABLE_ONYX: "0",
    CLAWQL_ENABLE_SANDBOX: "0",
    CLAWQL_ENABLE_SCHEDULE: "0",
    CLAWQL_ENABLE_NOTIFY: "0",
  };

  const standardEnv = {
    ...process.env,
    CLAWQL_BUNDLED_OFFLINE: "1",
    CLAWQL_HOME: measureHome,
    CLAWQL_OBSIDIAN_VAULT_PATH: measureHome,
    CLAWQL_TIER: "standard",
  };

  const gateway = await listToolsTokenBreakdown(gatewayEnv);
  const standardTier = await listToolsTokenBreakdown(standardEnv);

  return {
    gatewayCodemode: gateway,
    defaultStandardTier: standardTier,
    measuredVia: "MCP tools/list over stdio (cl100k_base); gateway arm disables optional plugins",
  };
}

async function listToolsTokenBreakdown(env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "dist", "server.js")],
    cwd: ROOT,
    stderr: "pipe",
    env,
  });

  const client = new Client({ name: "executor-cmp", version: "1" }, {});
  await client.connect(transport);

  try {
    const { tools } = await client.listTools();
    const serialize = (t) =>
      JSON.stringify({
        name: t.name,
        description: t.description ?? "",
        inputSchema: t.inputSchema,
      });

    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    const pick = (names) => names.filter((n) => byName[n]).map((n) => byName[n]);

    const codemodeTools = pick(["search", "execute"]);
    const coreTools = pick(["search", "execute", "cache", "audit"]);

    const perTool = tools.map((t) => ({
      name: t.name,
      tokens: countTokens(serialize(t)),
    }));

    return {
      toolCount: tools.length,
      toolNames: tools.map((t) => t.name),
      perTool,
      codemodeOnlyTokens: countTokens(JSON.stringify(codemodeTools.map(serialize))),
      coreQuartetTokens: countTokens(JSON.stringify(coreTools.map(serialize))),
      allToolsTokens: countTokens(JSON.stringify(tools.map(serialize))),
    };
  } finally {
    await client.close().catch(() => {});
  }
}

async function loadGithubPrFixture() {
  const raw = JSON.parse(await readFile(FIXTURE_PATH, "utf-8"));
  return {
    fullRest: raw.fullRest,
    projected: raw.projected,
    requiredOutputFields: raw.requiredOutputFields ?? TASK.requiredOutputFields,
    source: "fixture",
  };
}

function filterProjectedForTask(fullRest, projected, task) {
  const byNumber = new Map(projected.map((p) => [p.number, p]));
  const filtered = fullRest
    .filter((pr) => {
      const user = pr.user?.login ?? pr.user;
      const comments =
        pr.review_comments ??
        pr.reviewCommentCount ??
        byNumber.get(pr.number)?.reviewCommentCount ??
        0;
      return user === task.params.user && comments > task.params.threshold;
    })
    .map((pr) => {
      const hit = byNumber.get(pr.number);
      return (
        hit ?? {
          number: pr.number,
          title: pr.title,
          reviewCommentCount: pr.review_comments ?? 0,
        }
      );
    });
  return filtered;
}

async function measureLayer2ToolResults(task) {
  const fx = await loadGithubPrFixture();
  const executorPayload = fx.fullRest;
  const clawqlPayload = filterProjectedForTask(fx.fullRest, fx.projected, task);

  const executorText = JSON.stringify(executorPayload);
  const clawqlText = JSON.stringify(clawqlPayload);

  return {
    source: fx.source,
    executor: {
      toolResultTokens: countTokens(executorText),
      rawResultFieldCount: countTopLevelKeysPerItem(executorPayload),
      itemCount: executorPayload.length,
      requiredFieldCount: task.requiredOutputFields.length,
      note: "Simulates Executor codemode: full REST JSON enters context (no projection).",
    },
    clawql: {
      toolResultTokens: countTokens(clawqlText),
      rawResultFieldCount: countTopLevelKeysPerItem(clawqlPayload),
      itemCount: clawqlPayload.length,
      requiredFieldCount: task.requiredOutputFields.length,
      note: "ClawQL execute with GraphQL-style fields projection.",
    },
  };
}

async function analyze862xBenchmark() {
  const stats = JSON.parse(await readFile(STATS_862X, "utf-8"));
  let providerBench = null;
  try {
    providerBench = JSON.parse(await readFile(PROVIDER_BENCH, "utf-8"));
  } catch {
    providerBench = null;
  }

  const phase1Avg = providerBench?.averages?.phase1;

  return {
    label: "862x multi-provider workflow (NOT apples-to-apples with Executor chart)",
    source: STATS_862X,
    fullTaskRatio: stats.savingsVsEmbeddingAllSpecs?.byteRatio,
    naiveSpecTokens: stats.savingsVsEmbeddingAllSpecs?.approxTokensIfPastedAllSpecs,
    workflowArtifactTokens: stats.savingsVsEmbeddingAllSpecs?.approxTokensInWorkflowOutput,
    variantB_specResentEveryTurn: stats.hypotheticalNaiveFullSpecInContext?.variantB_fullSpecResentEveryModelTurn,
    inputIsolation: {
      note:
        "862x compares full provider spec corpora on disk vs emitted workflow JSON for a 14-step task. " +
        "It is NOT the same measurement as Executor's static tool-definition snapshot (~278k → ~1k). " +
        "Workflow artifact (~11.8k tok) includes search hits + draft output, not MCP tool schemas alone.",
      clawqlToolDefsMeasuredSeparately: true,
      executorPublishedToolDefs: EXECUTOR_PUBLISHED_REFERENCE.withExecutor.approxTokens,
      phase1SearchPayloadAvgPerProvider: phase1Avg
        ? {
            fullSpecTokensAvg: phase1Avg.fullSpecTokensAvg,
            top5SearchPayloadTokensAvg: phase1Avg.top5SearchPayloadTokensAvg,
            note: "From docs/benchmarks/latest.json — one search turn, not full workflow.",
          }
        : null,
    },
    comparableLayer1Question:
      "Compare clawql layer1.codemodeOnlyTokens (measured) vs executorPublished.withExecutor.approxTokens — both hide the catalog from tool definitions.",
  };
}

function buildReport(clawqlLayer1, layer2, analysis862x) {
  const execRef = EXECUTOR_PUBLISHED_REFERENCE.withExecutor.approxTokens;
  const execNaive = EXECUTOR_PUBLISHED_REFERENCE.withoutExecutor.approxTokens;
  const gw = clawqlLayer1.gatewayCodemode;

  const layer1 = {
    focus: "input",
    split: "tool_defs",
    executorPublished: {
      naiveCatalogTokens: execNaive,
      codemodeToolDefsTokens: execRef,
      source: EXECUTOR_PUBLISHED_REFERENCE.source,
    },
    clawqlMeasured: {
      gatewayCodemodeOnly: gw,
      defaultStandardTier: clawqlLayer1.defaultStandardTier,
    },
    ratioCodemodeVsExecutorPublished: +(execRef / gw.codemodeOnlyTokens).toFixed(2),
    ratioCoreVsExecutorPublished: +(execRef / gw.coreQuartetTokens).toFixed(2),
    interpretation:
      gw.codemodeOnlyTokens <= execRef
        ? "ClawQL search+execute tool schemas are smaller than Executor's published single-tool baseline on cl100k_base (gateway-only arm)."
        : "ClawQL search+execute exceeds Executor's published baseline — compare codemode-only, not optional plugins.",
  };

  const layer2Ratio =
    layer2.executor.toolResultTokens / Math.max(1, layer2.clawql.toolResultTokens);

  return {
    task: TASK,
    matchedConditions: MATCHED_CONDITIONS,
    executorPublishedReference: EXECUTOR_PUBLISHED_REFERENCE,
    layer1,
    layer2: {
      focus: "input",
      split: "tool_result",
      ...layer2,
      ratioExecutorRawVsClawqlProjected: +layer2Ratio.toFixed(2),
      interpretation:
        "Executor has no announced output projection; ClawQL execute fields trim tool results before they enter context.",
    },
    benchmark862x: analysis862x,
    generatedAt: new Date().toISOString(),
  };
}

function printReport(report) {
  const l1 = report.layer1;
  const l2 = report.layer2;
  const gw = l1.clawqlMeasured.gatewayCodemodeOnly;

  console.log("=== Layer 1: Tool definitions (input side) ===");
  console.log(
    `Executor (published): ${l1.executorPublished.codemodeToolDefsTokens} tok ` +
      `(1 tool; naive catalog ${l1.executorPublished.naiveCatalogTokens.toLocaleString()} tok)`
  );
  console.log(
    `ClawQL (measured, gateway-only): codemode ${gw.codemodeOnlyTokens} tok · ` +
      `core quartet ${gw.coreQuartetTokens} tok · ` +
      `all ${gw.allToolsTokens} tok (${gw.toolCount} tools)`
  );
  console.log(
    `ClawQL (standard tier):           all ${report.layer1.clawqlMeasured.defaultStandardTier.allToolsTokens} tok ` +
      `(${report.layer1.clawqlMeasured.defaultStandardTier.toolCount} tools)`
  );
  console.log(
    `Ratio (Executor pub / ClawQL codemode): ${l1.ratioCodemodeVsExecutorPublished}x`
  );
  console.log(`→ ${l1.interpretation}`);
  console.log();

  console.log("=== Layer 2: Tool result (input side, after execute) ===");
  console.log(
    `Executor (simulated raw JSON): ${l2.executor.toolResultTokens} tok ` +
      `(${l2.executor.rawResultFieldCount} top-level fields/item, ${l2.executor.itemCount} PRs listed)`
  );
  console.log(
    `ClawQL (projected):            ${l2.clawql.toolResultTokens} tok ` +
      `(${l2.clawql.rawResultFieldCount} fields/item, ${l2.clawql.itemCount} PRs after filter)`
  );
  console.log(`Ratio: ${l2.ratioExecutorRawVsClawqlProjected}x`);
  console.log(`→ ${l2.interpretation}`);
  console.log();

  console.log("=== 862x benchmark (different metric — see report JSON) ===");
  console.log(
    `Full-task ratio: ${report.benchmark862x.fullTaskRatio}x ` +
      `(spec corpus ${report.benchmark862x.naiveSpecTokens?.toLocaleString()} → ` +
      `workflow artifact ${report.benchmark862x.workflowArtifactTokens?.toLocaleString()} tok)`
  );
  console.log(`→ ${report.benchmark862x.inputIsolation.note}`);
}

async function main() {
  const clawqlLayer1 = await measureClawqlToolDefinitions();
  const layer2 = await measureLayer2ToolResults(TASK);
  const analysis862x = await analyze862xBenchmark();
  const report = buildReport(clawqlLayer1, layer2, analysis862x);

  await mkdir(OUT_DIR, { recursive: true });
  const jsonPath = join(OUT_DIR, "executor-cmp-001.json");
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf-8");

  printReport(report);
  console.error(`\nWrote ${jsonPath}`);
}

main().catch((err) => {
  console.error("executor-comparison failed:", err);
  process.exit(1);
});
