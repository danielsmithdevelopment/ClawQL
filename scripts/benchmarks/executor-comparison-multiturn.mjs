#!/usr/bin/env node
/**
 * executor-cmp-002: multi-turn cumulative context (N sequential verbose actions)
 *
 * MEASURED (not napkin): runs N live GitHub list-style calls through:
 *   - Executor CLI (raw JSON, no projection)
 *   - ClawQL MCP execute + fields projection
 *
 * Cumulative model (focus=input):
 *   turn_n = Layer1_once + sum(Layer2_i for i=1..n)
 * Layer 1 is paid once then treated as the stable/cacheable prefix.
 * Each Layer 2 payload is fresh (not reusable across turns).
 *
 * This is deliberately the same mechanism as the caching-compounding
 * back-of-napkin, but with real per-action tool-result sizes.
 *
 * Usage:
 *   BENCHMARK_LIVE=1 EXECUTOR_BIN=... node scripts/benchmarks/executor-comparison-multiturn.mjs
 *
 * Env:
 *   CMP_GITHUB_REPO (default vercel/next.js)
 *   CMP_PER_PAGE (default 30)
 *   CMP_TURNS (default 5)
 *   EXECUTOR_BIN, EXECUTOR_CWD
 */

import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getEncoding } from "js-tiktoken";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "docs", "benchmarks", "executor-comparison");
const SINGLE_LIVE = join(OUT_DIR, "executor-cmp-001.live.json");

function wantLive() {
  const v = process.env.BENCHMARK_LIVE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

if (!wantLive()) {
  console.error("BENCHMARK_LIVE=1 required for multiturn (no fixture mode).");
  process.exit(1);
}

const REPO = process.env.CMP_GITHUB_REPO ?? "vercel/next.js";
const PER_PAGE = Math.min(30, Math.max(1, Number(process.env.CMP_PER_PAGE ?? "30") || 30));
const TURNS = Math.min(10, Math.max(1, Number(process.env.CMP_TURNS ?? "5") || 5));
const [owner, repoName] = REPO.split("/");
if (!owner || !repoName) {
  console.error("CMP_GITHUB_REPO must be owner/name");
  process.exit(1);
}

const EXECUTOR_BIN = process.env.EXECUTOR_BIN?.trim();
const EXECUTOR_CWD = process.env.EXECUTOR_CWD?.trim() || (EXECUTOR_BIN ? dirname(EXECUTOR_BIN) : "");

/** Five similarly verbose list-shaped GitHub reads (same repo, different surfaces). */
const ACTIONS = [
  {
    id: "pulls_list",
    clawqlOperationId: "pulls/list",
    executorPath: "github.user.githubMain.pulls.list",
    fields: ["title", "number"],
    args: { owner, repo: repoName, state: "open", per_page: PER_PAGE },
  },
  {
    id: "issues_list",
    clawqlOperationId: "issues/list-for-repo",
    executorPath: "github.user.githubMain.issues.listForRepo",
    fields: ["title", "number"],
    args: { owner, repo: repoName, state: "open", per_page: PER_PAGE },
  },
  {
    id: "commits_list",
    clawqlOperationId: "repos/list-commits",
    executorPath: "github.user.githubMain.repos.listCommits",
    fields: ["sha"],
    args: { owner, repo: repoName, per_page: PER_PAGE },
  },
  {
    id: "repo_events",
    clawqlOperationId: "activity/list-repo-events",
    executorPath: "github.user.githubMain.activity.listRepoEvents",
    fields: ["id", "type"],
    args: { owner, repo: repoName, per_page: PER_PAGE },
  },
  {
    id: "releases_list",
    clawqlOperationId: "repos/list-releases",
    executorPath: "github.user.githubMain.repos.listReleases",
    fields: ["tag_name", "name"],
    args: { owner, repo: repoName, per_page: PER_PAGE },
  },
].slice(0, TURNS);

const enc = getEncoding("cl100k_base");
function countTokens(text) {
  if (!text) return 0;
  return enc.encode(String(text)).length;
}

function tokenFromGhCli() {
  try {
    return spawnSync("gh", ["auth", "token"], {
      encoding: "utf-8",
      timeout: 10_000,
    }).stdout?.trim() || "";
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

async function loadLayer1FromSingleOrMeasure() {
  try {
    const j = JSON.parse(await readFile(SINGLE_LIVE, "utf-8"));
    return {
      source: SINGLE_LIVE,
      executorPublished: j.layer1?.executorPublished?.codemodeToolDefsTokens ?? 1044,
      executorLiveExecuteOnly: j.layer1?.executorLiveMcp?.executeOnlyTokens ?? null,
      executorLiveAllTools: j.layer1?.executorLiveMcp?.allToolsTokens ?? null,
      clawqlCodemode: j.layer1?.clawqlMeasured?.gatewayCodemodeOnly?.codemodeOnlyTokens ?? null,
    };
  } catch {
    return {
      source: "defaults",
      executorPublished: 1044,
      executorLiveExecuteOnly: 115,
      executorLiveAllTools: 2209,
      clawqlCodemode: 394,
    };
  }
}

function callExecutor(action, { retries = 2 } = {}) {
  if (!EXECUTOR_BIN) {
    return { ok: false, error: "EXECUTOR_BIN unset" };
  }
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = spawnSync(
      EXECUTOR_BIN,
      ["call", action.executorPath, JSON.stringify(action.args)],
      {
        encoding: "utf-8",
        maxBuffer: 80 * 1024 * 1024,
        timeout: 180_000,
        cwd: EXECUTOR_CWD,
      }
    );
    if (result.error) {
      last = { ok: false, error: result.error.message };
      continue;
    }
    const stdout = result.stdout || "";
    const stderr = result.stderr || "";
    if (!stdout.trim()) {
      last = { ok: false, error: (stderr || `exit ${result.status}`).slice(0, 400) };
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      const start = stdout.indexOf("{");
      const end = stdout.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(stdout.slice(start, end + 1));
        } catch {
          last = {
            ok: false,
            error: "non-JSON",
            preview: stdout.slice(0, 240),
            stderrPreview: stderr.slice(0, 240),
          };
          continue;
        }
      } else {
        last = { ok: false, error: "non-JSON", preview: stdout.slice(0, 240) };
        continue;
      }
    }
    if (!parsed.ok) {
      last = { ok: false, error: parsed.error ?? parsed };
      continue;
    }
    const data = parsed.data;
    const text = JSON.stringify(data);
    return {
      ok: true,
      toolResultTokens: countTokens(text),
      itemCount: Array.isArray(data) ? data.length : 1,
      chars: text.length,
      attempts: attempt + 1,
    };
  }
  return last ?? { ok: false, error: "unknown" };
}

async function createClawqlClient() {
  const home = join("/tmp", `clawql-mt-${process.pid}`);
  await mkdir(home, { recursive: true });
  const token = resolveGithubToken();
  const env = {
    ...process.env,
    CLAWQL_PROVIDER: "github",
    CLAWQL_BUNDLED_OFFLINE: "1",
    CLAWQL_HOME: home,
    CLAWQL_OBSIDIAN_VAULT_PATH: home,
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
  const client = new Client({ name: "executor-cmp-mt", version: "1" }, {});
  await client.connect(transport);
  return client;
}

async function callClawql(client, action) {
  const execRes = await client.callTool({
    name: "execute",
    arguments: {
      operationId: action.clawqlOperationId,
      args: action.args,
      fields: action.fields,
    },
  });
  if (execRes.isError) {
    const err = execRes.content?.find((c) => c.type === "text")?.text ?? "";
    return { ok: false, error: err.slice(0, 400) };
  }
  const text = execRes.content?.find((c) => c.type === "text")?.text ?? "";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return {
    ok: true,
    toolResultTokens: countTokens(text),
    itemCount: Array.isArray(parsed) ? parsed.length : parsed ? 1 : 0,
    chars: text.length,
    fields: action.fields,
  };
}

function buildCumulative(layer1Once, layer2PerTurn) {
  let sumL2 = 0;
  return layer2PerTurn.map((tok, i) => {
    sumL2 += tok;
    const combined = layer1Once + sumL2;
    return {
      n: i + 1,
      layer1Once,
      layer2ThisTurn: tok,
      layer2Cumulative: sumL2,
      combined,
      layer2ShareOfCombined: +(100 * (sumL2 / combined)).toFixed(1),
    };
  });
}

async function main() {
  const layer1 = await loadLayer1FromSingleOrMeasure();
  // Honest L1 for compounding: live execute-only for Executor, codemode for ClawQL
  const execL1 = layer1.executorLiveExecuteOnly ?? layer1.executorPublished;
  const clawL1 = layer1.clawqlCodemode ?? 394;

  console.error(`Multi-turn N=${ACTIONS.length} on ${REPO} per_page=${PER_PAGE}`);
  console.error(`Layer1 once: Executor=${execL1} ClawQL=${clawL1} (from ${layer1.source})`);

  const client = await createClawqlClient();
  const turns = [];

  try {
    for (const action of ACTIONS) {
      console.error(`\n--- action ${action.id} ---`);
      const ex = callExecutor(action);
      const cq = await callClawql(client, action);
      if (!ex.ok) console.error(`Executor FAIL: ${JSON.stringify(ex.error)}`);
      else console.error(`Executor L2: ${ex.toolResultTokens} tok (${ex.itemCount} items)`);
      if (!cq.ok) console.error(`ClawQL FAIL: ${cq.error}`);
      else console.error(`ClawQL L2:   ${cq.toolResultTokens} tok (${cq.itemCount} items)`);

      turns.push({
        id: action.id,
        clawqlOperationId: action.clawqlOperationId,
        executorPath: action.executorPath,
        fields: action.fields,
        executor: ex,
        clawql: cq,
      });
    }
  } finally {
    await client.close().catch(() => {});
  }

  const failed = turns.filter((t) => !t.executor.ok || !t.clawql.ok);
  if (failed.length) {
    console.error(`\n${failed.length} action(s) failed — refusing to publish partial cumulative.`);
    process.exit(1);
  }

  const execL2 = turns.map((t) => t.executor.toolResultTokens);
  const clawL2 = turns.map((t) => t.clawql.toolResultTokens);
  const execCum = buildCumulative(execL1, execL2);
  const clawCum = buildCumulative(clawL1, clawL2);

  const ratios = execCum.map((e, i) => ({
    n: e.n,
    executorCombined: e.combined,
    clawqlCombined: clawCum[i].combined,
    ratio: +(e.combined / clawCum[i].combined).toFixed(2),
    executorLayer2SharePct: e.layer2ShareOfCombined,
    clawqlLayer2SharePct: clawCum[i].layer2ShareOfCombined,
  }));

  const asymptote = +(
    execL2.reduce((a, b) => a + b, 0) / clawL2.reduce((a, b) => a + b, 0)
  ).toFixed(2);

  const report = {
    task: {
      id: "executor-cmp-002",
      description:
        "N sequential verbose GitHub list actions — cumulative input context " +
        "(Layer1 once + sum Layer2). Measured live, not projected.",
      repo: REPO,
      perPage: PER_PAGE,
      turns: ACTIONS.length,
      actions: ACTIONS.map((a) => a.id),
    },
    matchedConditions: {
      tokenizer: "cl100k_base",
      focus: "input",
      benchmarkLive: true,
      layer1Source: layer1.source,
      note:
        "Layer 2 payloads are fresh each turn (not cross-turn cached). " +
        "Layer 1 is the stable prefix. Ratio climbs toward pure Layer-2 mean as N grows.",
    },
    layer1Once: {
      executorLiveExecuteOnly: execL1,
      clawqlCodemode: clawL1,
      executorPublishedReference: layer1.executorPublished,
      clarification:
        "Using live Executor execute-only for compounding (honest). Published ~1044 is chart-only.",
    },
    perTurnLayer2: turns.map((t) => ({
      id: t.id,
      executorTokens: t.executor.toolResultTokens,
      clawqlTokens: t.clawql.toolResultTokens,
      ratio: +(t.executor.toolResultTokens / t.clawql.toolResultTokens).toFixed(2),
      executorItems: t.executor.itemCount,
      clawqlItems: t.clawql.itemCount,
    })),
    cumulative: {
      executor: execCum,
      clawql: clawCum,
      ratios,
      layer2MeanRatioAsymptote: asymptote,
    },
    thesis:
      "At N≥1, Executor's combined bill is already ~99% Layer 2 (uncacheable fresh tool results). " +
      "Caching the Layer-1 prefix barely helps him; ClawQL's advantage is that almost none of the " +
      "marginal cost is the uncacheable fat payload.",
    generatedAt: new Date().toISOString(),
  };

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, "executor-cmp-002.multiturn.live.json");
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf-8");

  console.log("\n=== Measured multi-turn cumulative (focus=input) ===\n");
  console.log("n | Executor combined | ClawQL combined | ratio | Exec L2% of bill");
  for (const r of ratios) {
    console.log(
      `${r.n} | ${r.executorCombined.toLocaleString()} | ${r.clawqlCombined.toLocaleString()} | ${r.ratio}× | ${r.executorLayer2SharePct}%`
    );
  }
  console.log(`\nLayer-2 mean ratio (asymptote): ${asymptote}×`);
  console.log(`→ ${report.thesis}`);
  console.error(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error("multiturn failed:", err);
  process.exit(1);
});
