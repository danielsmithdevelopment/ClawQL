#!/usr/bin/env node
/**
 * executor-cmp-001: Layer 1 (tool definitions) vs Layer 2 (tool results)
 *
 * Layer 1: ClawQL MCP tools/list measured with cl100k_base vs Executor's
 * published homepage chart (~1,044 tok). Executor Layer 1 is REFERENCE only
 * (not re-measured via Executor SDK).
 *
 * Layer 2: GitHub PR list tool-result size.
 *   - BENCHMARK_LIVE=0 (default): fixture in docs/benchmarks/response-examples/
 *   - BENCHMARK_LIVE=1: live GitHub REST vs live ClawQL execute+fields
 *
 * IMPORTANT LABELS (do not blur in writeups):
 *   - Fixture numbers are NOT live Executor runtime measurements.
 *   - Live Layer 2 "executor" arm = raw GitHub REST JSON (Executor's documented
 *     behavior: no output projection). Executor SDK is NOT wired unless
 *     EXECUTOR_MCP_URL is set and responds.
 *   - Headline Layer 1 parity number is gateway codemode (search+execute) only.
 *     Core quartet / standard-tier totals are context, not the apples-to-apples claim.
 *
 * Usage:
 *   npm run benchmark:executor-comparison
 *   BENCHMARK_LIVE=1 CMP_GITHUB_REPO=vercel/next.js npm run benchmark:executor-comparison
 *
 * Env:
 *   CMP_GITHUB_USER, CMP_GITHUB_REPO, CMP_THRESHOLD
 *   BENCHMARK_LIVE=1
 *   EXECUTOR_MCP_URL — optional Streamable HTTP MCP endpoint for real Executor tools/list
 */

import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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

function wantLive() {
  const v = process.env.BENCHMARK_LIVE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const LIVE = wantLive();

const TASK = {
  id: "executor-cmp-001",
  description: LIVE
    ? "List open pull requests in {repo}. Return title and number for each " +
      "(optional author filter: {user}). Measures tool-result tokens after the list call."
    : "Find all open PRs authored by {user} in {repo} with more than " +
      "{threshold} review comments. Return title and comment count for each.",
  params: {
    user: process.env.CMP_GITHUB_USER ?? (LIVE ? "marcoshernanz" : "alice-dev"),
    repo: process.env.CMP_GITHUB_REPO ?? (LIVE ? "vercel/next.js" : "acme/platform"),
    threshold: Number(process.env.CMP_THRESHOLD ?? (LIVE ? "0" : "3")) || 0,
    perPage: Math.min(30, Math.max(1, Number(process.env.CMP_PER_PAGE ?? "30") || 30)),
  },
  requiredOutputFields: LIVE ? ["title", "number"] : ["title", "reviewCommentCount"],
  projectionFields: LIVE ? ["title", "number"] : ["title", "number", "review_comments"],
};

const MATCHED_CONDITIONS = {
  tokenizer: "cl100k_base",
  numPredict: 256,
  temperature: 0,
  systemPromptFixed: true,
  focus: "input",
  benchmarkLive: LIVE,
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

function tokenFromGhCli() {
  if (process.env.GITHUB_USE_GH_TOKEN === "0") return "";
  try {
    return execSync("gh auth token", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    }).trim();
  } catch {
    return "";
  }
}

function resolveGithubToken() {
  return (
    process.env.CLAWQL_BEARER_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    tokenFromGhCli()
  );
}

function parseOwnerRepo(repo) {
  const [owner, name] = String(repo).split("/");
  if (!owner || !name) {
    throw new Error(`CMP_GITHUB_REPO must be owner/name, got ${repo}`);
  }
  return { owner, repo: name };
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

async function measureClawqlToolDefinitions() {
  const measureHome = join("/tmp", `clawql-exec-cmp-${process.pid}`);
  await mkdir(measureHome, { recursive: true });

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

async function measureExecutorToolDefinitionsIfConfigured() {
  const bin = process.env.EXECUTOR_BIN?.trim();
  const url = process.env.EXECUTOR_MCP_URL?.trim();

  if (!bin && !url) {
    return {
      wired: false,
      note: "EXECUTOR_BIN / EXECUTOR_MCP_URL unset — Layer 1 uses published executor.sh reference only (~1,044 tok).",
    };
  }

  let transport;
  let label;
  if (bin) {
    transport = new StdioClientTransport({
      command: bin,
      args: ["mcp"],
      cwd: process.env.EXECUTOR_CWD?.trim() || dirname(bin),
      stderr: "pipe",
    });
    label = `stdio:${bin} mcp`;
  } else {
    transport = new StreamableHTTPClientTransport(new URL(url));
    label = `http:${url}`;
  }

  const client = new Client({ name: "executor-cmp-sdk", version: "1" }, {});
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    const serialize = (t) =>
      JSON.stringify({
        name: t.name,
        description: t.description ?? "",
        inputSchema: t.inputSchema,
      });
    const executeTool = tools.find((t) => t.name === "execute");
    const allTokens = countTokens(JSON.stringify(tools.map(serialize)));
    const executeOnlyTokens = executeTool
      ? countTokens(serialize(executeTool))
      : null;
    return {
      wired: true,
      endpoint: label,
      toolCount: tools.length,
      toolNames: tools.map((t) => t.name),
      executeOnlyTokens,
      allToolsTokens: allTokens,
      perTool: tools.map((t) => ({
        name: t.name,
        tokens: countTokens(serialize(t)),
      })),
      note:
        "Live Executor MCP tools/list. Homepage ~1,044 is a marketed execute-description size; " +
        "this install may differ (thinner execute + extra tools). Report both.",
    };
  } finally {
    await client.close().catch(() => {});
  }
}

async function measureExecutorLayer2ViaCli(task) {
  const bin = process.env.EXECUTOR_BIN?.trim();
  const toolPath =
    process.env.EXECUTOR_GITHUB_PULLS_PATH?.trim() ||
    "github.user.githubMain.pulls.list";
  if (!bin) {
    return null;
  }

  const { owner, repo } = parseOwnerRepo(task.params.repo);
  const argsJson = JSON.stringify({
    owner,
    repo,
    state: "open",
    per_page: task.params.perPage,
  });

  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(bin, ["call", toolPath, argsJson], {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: 120_000,
    cwd: process.env.EXECUTOR_CWD?.trim() || dirname(bin),
  });

  if (result.error) {
    return { ok: false, error: String(result.error.message), toolPath };
  }
  const stdout = result.stdout || "";
  if (result.status !== 0 && !stdout.trim()) {
    return {
      ok: false,
      error: (result.stderr || `exit ${result.status}`).slice(0, 500),
      toolPath,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return {
      ok: false,
      error: "Executor CLI returned non-JSON",
      toolPath,
      preview: stdout.slice(0, 300),
    };
  }

  if (!parsed.ok) {
    return { ok: false, error: parsed.error ?? parsed, toolPath };
  }

  const items = Array.isArray(parsed.data) ? parsed.data : [];
  const text = JSON.stringify(items);
  return {
    ok: true,
    toolPath,
    items,
    text,
    toolResultTokens: countTokens(text),
    envelopeTokens: countTokens(stdout),
  };
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
      if (task.params.user && user !== task.params.user) return false;
      return comments > task.params.threshold;
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

async function fetchLiveGithubPullList(task) {
  const token = resolveGithubToken();
  const { owner, repo } = parseOwnerRepo(task.params.repo);
  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/pulls`);
  url.searchParams.set("state", "open");
  url.searchParams.set("per_page", String(task.params.perPage));

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "clawql-executor-cmp",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub pulls list failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  if (!Array.isArray(body)) {
    throw new Error(`Unexpected GitHub list response: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return {
    items: body,
    text: JSON.stringify(body),
    auth: token ? "token" : "anonymous",
    url: url.toString(),
  };
}

async function clawqlLiveExecuteProjected(task) {
  const measureHome = join("/tmp", `clawql-exec-cmp-live-${process.pid}`);
  await mkdir(measureHome, { recursive: true });
  const token = resolveGithubToken();
  const { owner, repo } = parseOwnerRepo(task.params.repo);

  const env = {
    ...process.env,
    CLAWQL_PROVIDER: "github",
    CLAWQL_BUNDLED_OFFLINE: "1",
    CLAWQL_HOME: measureHome,
    CLAWQL_OBSIDIAN_VAULT_PATH: measureHome,
    CLAWQL_TIER: "",
    CLAWQL_INSTANCE_SPEC: "",
    CLAWQL_INSTANCE_SPEC_FILE: "",
    CLAWQL_ENABLE_MEMORY: "0",
    CLAWQL_ENABLE_DOCUMENTS: "0",
    CLAWQL_ENABLE_PAGEINDEX: "0",
  };
  if (token) {
    env.CLAWQL_BEARER_TOKEN = token;
    env.GITHUB_TOKEN = token;
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(ROOT, "dist", "server.js")],
    cwd: ROOT,
    stderr: "pipe",
    env,
  });
  const client = new Client({ name: "executor-cmp-live", version: "1" }, {});
  await client.connect(transport);
  try {
    const searchRes = await client.callTool({
      name: "search",
      arguments: { query: "pulls/list GET repos/{owner}/{repo}/pulls", limit: 5 },
    });
    const searchText =
      searchRes.content?.find((c) => c.type === "text")?.text ?? "";

    const execRes = await client.callTool({
      name: "execute",
      arguments: {
        operationId: "pulls/list",
        args: {
          owner,
          repo,
          state: "open",
          per_page: task.params.perPage,
        },
        fields: task.projectionFields,
      },
    });
    if (execRes.isError) {
      const errText = execRes.content?.find((c) => c.type === "text")?.text ?? "";
      throw new Error(`ClawQL execute failed: ${errText.slice(0, 400)}`);
    }
    const text = execRes.content?.find((c) => c.type === "text")?.text ?? "";
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return {
      searchText,
      text,
      parsed,
      operationId: "pulls/list",
      fields: task.projectionFields,
    };
  } finally {
    await client.close().catch(() => {});
  }
}

async function measureLayer2ToolResults(task) {
  if (!LIVE) {
    const fx = await loadGithubPrFixture();
    const executorPayload = fx.fullRest;
    const clawqlPayload = filterProjectedForTask(fx.fullRest, fx.projected, task);
    const executorText = JSON.stringify(executorPayload);
    const clawqlText = JSON.stringify(clawqlPayload);
    return {
      source: "fixture",
      publishableAsLive: false,
      executorSdkWired: false,
      executor: {
        toolResultTokens: countTokens(executorText),
        rawResultFieldCount: countTopLevelKeysPerItem(executorPayload),
        itemCount: executorPayload.length,
        requiredFieldCount: task.requiredOutputFields.length,
        note: "FIXTURE — simulates Executor: full REST JSON enters context (no projection).",
      },
      clawql: {
        toolResultTokens: countTokens(clawqlText),
        rawResultFieldCount: countTopLevelKeysPerItem(clawqlPayload),
        itemCount: clawqlPayload.length,
        requiredFieldCount: task.requiredOutputFields.length,
        note: "FIXTURE — projected title/reviewCommentCount after task filter.",
      },
    };
  }

  const clawqlLive = await clawqlLiveExecuteProjected(task);
  const clawqlText = clawqlLive.text;

  const executorCli = await measureExecutorLayer2ViaCli(task);
  let executorArm;
  let executorSdkWired = false;
  let liveListMeta = null;

  if (executorCli?.ok) {
    executorSdkWired = true;
    executorArm = {
      toolResultTokens: executorCli.toolResultTokens,
      rawResultFieldCount: countTopLevelKeysPerItem(executorCli.items),
      itemCount: executorCli.items.length,
      requiredFieldCount: task.requiredOutputFields.length,
      note:
        `LIVE Executor CLI \`${executorCli.toolPath}\` — full tool result JSON (no output projection).`,
      toolPath: executorCli.toolPath,
      envelopeTokens: executorCli.envelopeTokens,
    };
  } else {
    const liveList = await fetchLiveGithubPullList(task);
    liveListMeta = {
      githubAuth: liveList.auth,
      githubUrl: liveList.url,
    };
    executorArm = {
      toolResultTokens: countTokens(liveList.text),
      rawResultFieldCount: countTopLevelKeysPerItem(liveList.items),
      itemCount: liveList.items.length,
      requiredFieldCount: task.requiredOutputFields.length,
      note:
        "LIVE GitHub REST list JSON — behavioral stand-in (Executor CLI not wired). " +
        (executorCli?.error ? `Executor CLI error: ${executorCli.error}` : "Set EXECUTOR_BIN to call real Executor."),
    };
  }

  return {
    source: executorSdkWired ? "live_executor_cli+clawql" : "live_github+clawql",
    publishableAsLive: true,
    executorSdkWired,
    live: {
      repo: task.params.repo,
      perPage: task.params.perPage,
      clawqlOperationId: clawqlLive.operationId,
      clawqlFields: clawqlLive.fields,
      ...liveListMeta,
    },
    executor: executorArm,
    clawql: {
      toolResultTokens: countTokens(clawqlText),
      rawResultFieldCount: countTopLevelKeysPerItem(
        Array.isArray(clawqlLive.parsed) ? clawqlLive.parsed : []
      ),
      itemCount: Array.isArray(clawqlLive.parsed) ? clawqlLive.parsed.length : 0,
      requiredFieldCount: task.requiredOutputFields.length,
      note: "LIVE ClawQL MCP execute pulls/list with fields projection.",
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
    variantB_specResentEveryTurn:
      stats.hypotheticalNaiveFullSpecInContext?.variantB_fullSpecResentEveryModelTurn,
    inputIsolation: {
      note:
        "862x compares full provider spec corpora on disk vs emitted workflow JSON for a 14-step task. " +
        "It is NOT the same measurement as Executor's static tool-definition snapshot (~278k → ~1k). " +
        "Workflow artifact (~11.8k tok) includes search hits + draft output, not MCP tool schemas alone. " +
        "Do not use 862× in the Executor comparison post.",
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
      "Compare clawql layer1 gatewayCodemodeOnly.codemodeOnlyTokens (measured) vs executorPublished.withExecutor.approxTokens — both hide the catalog from tool definitions.",
  };
}

function buildReport(clawqlLayer1, layer2, analysis862x, executorLiveLayer1) {
  const execRef = EXECUTOR_PUBLISHED_REFERENCE.withExecutor.approxTokens;
  const execNaive = EXECUTOR_PUBLISHED_REFERENCE.withoutExecutor.approxTokens;
  const gw = clawqlLayer1.gatewayCodemode;

  const layer1 = {
    focus: "input",
    split: "tool_defs",
    headlineNumber: "gatewayCodemodeOnly.codemodeOnlyTokens",
    headlineClarification:
      "394-class number is search+execute only — fairest parity with Executor's single-tool chart. " +
      "Core quartet (883) and standard-tier all-tools (3,548) are ClawQL with more capability on; " +
      "those are not what Executor's ~1,044 represents. Keep them separate in any post.",
    executorPublished: {
      naiveCatalogTokens: execNaive,
      codemodeToolDefsTokens: execRef,
      source: EXECUTOR_PUBLISHED_REFERENCE.source,
    },
    executorLiveMcp: executorLiveLayer1,
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
      interpretation: layer2.publishableAsLive
        ? layer2.executorSdkWired
          ? "LIVE Layer 2: real Executor CLI tool result vs live ClawQL projected execute."
          : "LIVE Layer 2: raw GitHub (Executor stand-in) vs ClawQL projected execute. Set EXECUTOR_BIN for real Executor."
        : "FIXTURE Layer 2 — not for public headlines. Re-run with BENCHMARK_LIVE=1.",
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
    `Executor (published reference): ${l1.executorPublished.codemodeToolDefsTokens} tok ` +
      `(1 tool; naive catalog ${l1.executorPublished.naiveCatalogTokens.toLocaleString()} tok)`
  );
  if (l1.executorLiveMcp?.wired) {
    console.log(
      `Executor (LIVE MCP execute-only): ${l1.executorLiveMcp.executeOnlyTokens} tok`
    );
    console.log(
      `Executor (LIVE MCP all tools):    ${l1.executorLiveMcp.allToolsTokens} tok ` +
        `(${l1.executorLiveMcp.toolCount} tools @ ${l1.executorLiveMcp.endpoint})`
    );
  } else {
    console.log(`Executor (LIVE MCP):            not wired (${l1.executorLiveMcp?.note ?? "n/a"})`);
  }
  console.log(
    `ClawQL HEADLINE (gateway codemode search+execute): ${gw.codemodeOnlyTokens} tok`
  );
  console.log(
    `ClawQL context only — core quartet: ${gw.coreQuartetTokens} tok · ` +
      `standard tier all tools: ${l1.clawqlMeasured.defaultStandardTier.allToolsTokens} tok ` +
      `(${l1.clawqlMeasured.defaultStandardTier.toolCount} tools) — NOT the parity claim`
  );
  console.log(
    `Ratio (Executor pub / ClawQL codemode): ${l1.ratioCodemodeVsExecutorPublished}x`
  );
  console.log(`→ ${l1.interpretation}`);
  console.log(`→ ${l1.headlineClarification}`);
  console.log();

  console.log(
    `=== Layer 2: Tool result (input side) — source=${l2.source} publishableAsLive=${l2.publishableAsLive} ===`
  );
  console.log(
    `Executor arm (raw JSON): ${l2.executor.toolResultTokens} tok ` +
      `(${l2.executor.rawResultFieldCount} top-level fields/item, ${l2.executor.itemCount} items)`
  );
  console.log(`  note: ${l2.executor.note}`);
  console.log(
    `ClawQL arm (projected):  ${l2.clawql.toolResultTokens} tok ` +
      `(${l2.clawql.rawResultFieldCount} fields/item, ${l2.clawql.itemCount} items)`
  );
  console.log(`  note: ${l2.clawql.note}`);
  console.log(`Ratio: ${l2.ratioExecutorRawVsClawqlProjected}x`);
  console.log(`→ ${l2.interpretation}`);
  console.log();

  console.log("=== 862x benchmark (different metric — do not blend into Executor post) ===");
  console.log(
    `Full-task ratio: ${report.benchmark862x.fullTaskRatio}x ` +
      `(spec corpus ${report.benchmark862x.naiveSpecTokens?.toLocaleString()} → ` +
      `workflow artifact ${report.benchmark862x.workflowArtifactTokens?.toLocaleString()} tok)`
  );
  console.log(`→ ${report.benchmark862x.inputIsolation.note}`);
}

async function main() {
  const clawqlLayer1 = await measureClawqlToolDefinitions();
  const executorLiveLayer1 = await measureExecutorToolDefinitionsIfConfigured();
  const layer2 = await measureLayer2ToolResults(TASK);
  const analysis862x = await analyze862xBenchmark();
  const report = buildReport(clawqlLayer1, layer2, analysis862x, executorLiveLayer1);

  await mkdir(OUT_DIR, { recursive: true });
  const suffix = LIVE ? "live" : "fixture";
  const jsonPath = join(OUT_DIR, `executor-cmp-001.${suffix}.json`);
  const latestPath = join(OUT_DIR, "executor-cmp-001.json");
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf-8");
  await writeFile(latestPath, JSON.stringify(report, null, 2), "utf-8");

  printReport(report);
  console.error(`\nWrote ${jsonPath}`);
  console.error(`Wrote ${latestPath}`);
}

main().catch((err) => {
  console.error("executor-comparison failed:", err);
  process.exit(1);
});
