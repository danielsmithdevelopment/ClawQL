#!/usr/bin/env node
/**
 * Real-model validation (SPEC): 50 sessions per arm × model, mock only.
 *
 * Fairness: every published comparison is **real-model vs real-model**. Do not
 * compare Cursor/OpenAI ClawQL sessions against scripted Executor / Cloudflare
 * code-mode token rows — code-mode arms must run through the same dual-model
 * gate (default arms include `executor_v2` against the local mock).
 *
 * Hosted Cloudflare code-mode is **out of this gate**: a real model on that
 * server would hit the live Cloudflare API (and could write on step 12). Use a
 * read-only token only if you deliberately add it later; otherwise leave it out.
 *
 * Secrets (never paste into chat / logs):
 *   OPENAI_API_KEY          — required
 *   OPENAI_BASE_URL         — OpenAI-compatible (must serve both pinned models)
 * OPTIONAL API alternate (not the SPEC Cursor gate):
 *   OPENAI_API_KEY + CF_MT_MODEL_FRONTIER / CF_MT_MODEL_SMALL
 *
 * SPEC gate (preferred, no secrets): Cursor Task subagents — see
 * prepare-real-model-cursor-gate.mjs and SPEC § Pre-committed gate
 * (pins: gpt-5.6-sol-medium + composer-2.5-fast).
 *
 * Pre-commit: shared workflow prompt, sessions interleaved across arms,
 * verdict from GATE_VERDICT_RULES only. Do not edit rules after a run.
 */
import { spawn } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  openSync,
  closeSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { getEncoding } from "js-tiktoken";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { clawqlEqualArmEnv } from "../lib/clawql-bench-env.mjs";
import { FAKE } from "./lib/fixture-ids.mjs";
import { buildExpectations, checkStep } from "./lib/success-checks.mjs";
import { CLAWQL_STEP_SHAPES } from "./lib/clawql-shapes.mjs";
import { createServer as createNetServer, createConnection } from "node:net";
import { ensureExecutorOpenapiApp } from "./lib/ensure-executor-openapi-app.mjs";
import { executorV2ToolScripts } from "./code-mode/published-scripts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const FIXTURE = process.env.FIXTURE || join(HERE, "fixtures/recording.synthetic.json");
const CURATED_OAS = join(HERE, "fixtures/curated-openapi.json");
const MOCK_JS = join(HERE, "mock/cloudflare-replay-mock.mjs");
const OUT_DIR = process.env.CF_MT_OUT_DIR || join(ROOT, "docs/benchmarks/cloudflare-multiturn");
const ITERS = Math.max(1, Number(process.env.CF_MT_REAL_ITERS || 50) || 50);
const API_KEY = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || "";
const BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const ARMS = (
  process.env.CF_MT_REAL_ARMS || "clawql_known_op,clawql_program,executor_v2"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_TURNS = Math.max(4, Number(process.env.CF_MT_REAL_MAX_TURNS || 24) || 24);
/** Session observation-token ceiling for “how often does context blow up”. */
const TOKEN_CEILING = Math.max(
  1000,
  Number(process.env.CF_MT_REAL_TOKEN_CEILING || 10_000) || 10_000
);
const TEMPERATURE = 0;
/** Pinned in SPEC — dual-model claim requires these exact Cursor Task slugs. */
const PINNED_FRONTIER = "gpt-5.6-sol-medium";
const PINNED_SMALL = "composer-2.5-fast";
/** Bump when model pins change before a run (never after results). */
const MODELS_PIN_REVISION = "2026-10-15-cursor-native";
const enc = getEncoding("cl100k_base");

function resolveModels() {
  if (process.env.CF_MT_MODEL || process.env.OPENAI_MODEL) {
    return [
      {
        id: process.env.CF_MT_MODEL || process.env.OPENAI_MODEL,
        label: "single",
      },
    ];
  }
  const frontier = process.env.CF_MT_MODEL_FRONTIER || PINNED_FRONTIER;
  const small = process.env.CF_MT_MODEL_SMALL || PINNED_SMALL;
  return [
    { id: frontier, label: "frontier" },
    { id: small, label: "small" },
  ];
}

function dualModelClaimEligible(models) {
  if (process.env.CF_MT_MODEL || process.env.OPENAI_MODEL) return false;
  if (models.length !== 2) return false;
  const byLabel = Object.fromEntries(models.map((m) => [m.label, m.id]));
  return byLabel.frontier === PINNED_FRONTIER && byLabel.small === PINNED_SMALL;
}

function countTokens(text) {
  if (text == null || text === "") return 0;
  return enc.encode(String(text)).length;
}
function toolText(res) {
  const c = res?.content;
  if (!Array.isArray(c)) return "";
  return c.filter((x) => x?.type === "text").map((x) => x.text).join("\n");
}
function percentileSorted(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
function medianSorted(sorted) {
  if (!sorted.length) return 0;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}
function pickPort() {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}
async function waitTcp(port, ms = 60000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const ok = await new Promise((r) => {
      const c = createConnection({ host: "127.0.0.1", port }, () => {
        c.end();
        r(true);
      });
      c.on("error", () => r(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`tcp timeout :${port}`);
}

/** Shared system prompt — arm differences come from tool descriptions only. */
function systemPrompt() {
  return [
    "You complete a 12-step Cloudflare zone audit using only the provided tools.",
    `Zone name: ${FAKE.auditZoneName}. Target IP: ${FAKE.targetIp}. Account id: ${FAKE.accountId}.`,
    "Return lean observations. Prefer server-side filtering when the tools support it.",
    "If a tool returns truncated:true, the preview is incomplete — retry with where/fields (or a tighter program), not full:true, unless you truly need every row.",
    "For count questions (A records, enabled firewall rules, …): when truncated, use the envelope totalCount field / note — never count the preview rows.",
    "Step 12 is a gated proposal only — do not PATCH DNS. Submit { proposal: { recordId, proxied: true }, gated: true }.",
    "Call submit_observation for every step 1–12 when you have the answer.",
  ].join("\n");
}

function mcpToolsToOpenAI(tools, { includeSubmit = true } = {}) {
  const out = tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description || t.name,
      parameters: t.inputSchema || { type: "object", properties: {} },
    },
  }));
  if (includeSubmit) {
    out.push({
      type: "function",
      function: {
        name: "submit_observation",
        description: "Submit the final observation for one workflow step (1–12).",
        parameters: {
          type: "object",
          properties: {
            step: { type: "integer", minimum: 1, maximum: 12 },
            observation: {},
          },
          required: ["step", "observation"],
        },
      },
    });
  }
  return out;
}

async function chatCompletions({ model, messages, tools }) {
  const body = {
    model,
    messages,
    temperature: TEMPERATURE,
    ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
  };
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`chat completions ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function startMock() {
  const child = spawn(process.execPath, [MOCK_JS], {
    env: { ...process.env, FIXTURE, MT_UPSTREAM_LATENCY: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let ready = null;
  let buf = "";
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("mock ready timeout")), 20000);
    child.stdout.on("data", (d) => {
      buf += d.toString();
      const line = buf.split("\n").find((l) => l.includes('"ready"'));
      if (line) {
        ready = JSON.parse(line);
        clearTimeout(t);
        resolve();
      }
    });
    child.stderr.on("data", (d) => process.stderr.write(d));
    child.on("exit", (c) => reject(new Error(`mock exited ${c}`)));
  });
  await waitTcp(Number(new URL(ready.baseUrl).port));
  return { child, baseUrl: ready.baseUrl };
}

async function startClawql(mockBase, { enablePrograms = false } = {}) {
  const home = join(tmpdir(), `cf-real-${process.pid}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(home, { recursive: true });
  const port = await pickPort();
  const env = clawqlEqualArmEnv({ home, specPath: CURATED_OAS, apiBase: mockBase });
  Object.assign(env, {
    PORT: String(port),
    MCP_HOST: "127.0.0.1",
    CLOUDFLARE_API_TOKEN: "bench-fake-token",
    CLAWQL_CATALOG_SQLITE: "1",
    CLAWQL_SEARCH_COMPACT: "0",
    CLAWQL_ENABLE_PROGRAMS: enablePrograms ? "1" : "0",
    CLAWQL_EXECUTE_RESULT_MAX_CHARS: "2000000",
  });
  const logPath = join(home, "clawql.log");
  const logFd = openSync(logPath, "w");
  const child = spawn(process.execPath, [join(ROOT, "dist/server-http.js")], {
    env,
    stdio: ["ignore", logFd, logFd],
  });
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (existsSync(logPath)) {
      const log = readFileSync(logPath, "utf8");
      if (log.includes("listening on") || log.includes("Streamable HTTP MCP")) break;
      if (log.includes("Fatal startup error")) throw new Error(log.slice(-1500));
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  await waitTcp(port, 10000);
  return {
    mcpUrl: `http://127.0.0.1:${port}/mcp`,
    close: async () => {
      try {
        process.kill(child.pid, "SIGTERM");
      } catch {
        /* ignore */
      }
      try {
        closeSync(logFd);
      } catch {
        /* ignore */
      }
      try {
        rmSync(home, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

async function connectHttpMcp(mcpUrl, name = "cf-real") {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
  const client = new Client({ name, version: "1" }, {});
  await client.connect(transport);
  return {
    client,
    close: async () => {
      await client.close().catch(() => {});
    },
  };
}

function classifyToolFailure(name, args, resultText) {
  const failures = [];
  let json = null;
  try {
    json = JSON.parse(resultText);
  } catch {
    /* ignore */
  }
  if (json?.status === "where_invalid" || /where_invalid|Invalid where JMESPath/i.test(resultText)) {
    failures.push({
      kind: "malformed_where",
      tool: name,
      where: typeof args?.where === "string" ? args.where : null,
      detail: (json?.error || resultText).slice(0, 240),
    });
  }
  if (json?.truncated === true && json?.reason === "observation_budget") {
    failures.push({
      kind: "observation_budget_truncated",
      tool: name,
      detail: (json?.note || "truncated preview").slice(0, 240),
    });
  }
  if (json?.ok === false && json?.status !== "where_invalid") {
    failures.push({
      kind: "tool_error",
      tool: name,
      detail: (json?.error || resultText).slice(0, 240),
    });
  }
  return failures;
}

async function runToolSession({
  model,
  arm,
  client,
  expectations,
  openaiTools,
  allowedToolNames,
  definitionTokens = 0,
}) {
  const t0 = performance.now();
  const observations = {};
  const failures = [];
  let turns = 0;
  let retries = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let observationTokens = 0;
  let codeTokens = 0;
  let toolCalls = 0;
  let whereAttempts = 0;
  let whereMalformed = 0;
  let observationBudgetHits = 0;

  const messages = [
    { role: "system", content: systemPrompt() },
    {
      role: "user",
      content:
        `Arm=${arm}. Complete steps 1–12. Useful operationIds: ` +
        Object.values(CLAWQL_STEP_SHAPES)
          .map((s) => s.operationId)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(", ") +
        ".",
    },
  ];

  while (turns < MAX_TURNS) {
    turns++;
    const completion = await chatCompletions({ model, messages, tools: openaiTools });
    const choice = completion.choices?.[0]?.message;
    if (!choice) throw new Error("empty model message");
    inputTokens += completion.usage?.prompt_tokens || countTokens(JSON.stringify(messages));
    outputTokens +=
      completion.usage?.completion_tokens ||
      countTokens(JSON.stringify(choice.content || "")) +
        countTokens(JSON.stringify(choice.tool_calls || []));
    messages.push(choice);
    const calls = choice.tool_calls || [];
    if (!calls.length) {
      if ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every((s) => observations[s] != null)) break;
      retries++;
      messages.push({
        role: "user",
        content: `Missing steps: ${[...Array(12)]
          .map((_, i) => i + 1)
          .filter((s) => !observations[s])
          .join(", ")}. Continue with tools.`,
      });
      continue;
    }
    for (const call of calls) {
      toolCalls++;
      const name = call.function?.name;
      let args = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        failures.push({ kind: "malformed_tool_args", tool: name, detail: "arguments JSON parse failed" });
        args = {};
      }
      let resultText = "";
      if (name === "submit_observation") {
        observations[args.step] = args.observation;
        resultText = JSON.stringify({ ok: true, step: args.step });
      } else if (allowedToolNames.has(name)) {
        if (typeof args.where === "string") whereAttempts++;
        // Model-written code bucket (same as scripted board): where/fields, plan source, or JS.
        if (typeof args.where === "string") codeTokens += countTokens(args.where);
        if (Array.isArray(args.fields)) codeTokens += countTokens(JSON.stringify(args.fields));
        if (typeof args.source === "string") codeTokens += countTokens(args.source);
        if (typeof args.code === "string") codeTokens += countTokens(args.code);
        if (args.plan != null) codeTokens += countTokens(JSON.stringify(args.plan));
        const res = await client.callTool({ name, arguments: args });
        resultText = toolText(res);
        observationTokens += countTokens(resultText);
        const classified = classifyToolFailure(name, args, resultText);
        for (const f of classified) {
          failures.push(f);
          if (f.kind === "malformed_where") {
            whereMalformed++;
            retries++;
          }
          if (f.kind === "observation_budget_truncated") {
            observationBudgetHits++;
            retries++;
          }
        }
      } else {
        failures.push({ kind: "unknown_tool", tool: name });
        resultText = JSON.stringify({ ok: false, error: `unknown tool ${name}` });
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: resultText.slice(0, 12000),
      });
    }
    if ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every((s) => observations[s] != null)) break;
  }

  let ok = true;
  const stepChecks = [];
  for (let step = 1; step <= 12; step++) {
    const check = checkStep(step, observations[step], expectations);
    ok &&= check.ok;
    stepChecks.push({ step, ok: check.ok, reason: check.reason || null });
    if (!check.ok) failures.push({ kind: "step_check_failed", step, detail: check.reason || null });
  }
  if (turns >= MAX_TURNS && !ok) {
    failures.push({ kind: "max_turns", detail: `hit MAX_TURNS=${MAX_TURNS}` });
  }

  const weightedTokens = definitionTokens + observationTokens + 5 * codeTokens;
  return {
    ok,
    turns,
    retries,
    toolCalls,
    inputTokens,
    outputTokens,
    observationTokens,
    codeTokens,
    definitionTokens,
    weightedTokens,
    whereAttempts,
    whereMalformed,
    observationBudgetHits,
    session_ms: performance.now() - t0,
    stepChecks,
    failures,
  };
}

function aggregateSessions(sessions) {
  const n = sessions.length || 1;
  const failKinds = {};
  for (const s of sessions) {
    for (const f of s.failures || []) {
      failKinds[f.kind] = (failKinds[f.kind] || 0) + 1;
    }
  }
  const obs = sessions.map((s) => s.observationTokens || 0).sort((a, b) => a - b);
  const weighted = sessions.map((s) => s.weightedTokens || 0).sort((a, b) => a - b);
  const code = sessions.map((s) => s.codeTokens || 0).sort((a, b) => a - b);
  const turns = sessions.map((s) => s.turns).sort((a, b) => a - b);
  const input = sessions.map((s) => s.inputTokens).sort((a, b) => a - b);
  const output = sessions.map((s) => s.outputTokens).sort((a, b) => a - b);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  return {
    task_success_rate: sessions.filter((s) => s.ok).length / sessions.length,
    turns_mean: mean(turns),
    turns_median: medianSorted(turns),
    turns_p90: percentileSorted(turns, 90),
    retries_mean: mean(sessions.map((s) => s.retries)),
    tool_calls_mean: mean(sessions.map((s) => s.toolCalls)),
    input_tokens_mean: mean(input),
    input_tokens_median: medianSorted(input),
    input_tokens_p90: percentileSorted(input, 90),
    output_tokens_mean: mean(output),
    output_tokens_median: medianSorted(output),
    output_tokens_p90: percentileSorted(output, 90),
    code_tokens_mean: mean(code),
    code_tokens_median: medianSorted(code),
    observation_tokens_mean: mean(obs),
    observation_tokens_median: medianSorted(obs),
    observation_tokens_p90: percentileSorted(obs, 90),
    observation_tokens_over_ceiling: sessions.filter((s) => (s.observationTokens || 0) > TOKEN_CEILING)
      .length,
    observation_token_ceiling: TOKEN_CEILING,
    weighted_tokens_mean: mean(weighted),
    weighted_tokens_median: medianSorted(weighted),
    weighted_tokens_p90: percentileSorted(weighted, 90),
    session_ms_mean: mean(sessions.map((s) => s.session_ms)),
    where_attempts_mean: mean(sessions.map((s) => s.whereAttempts || 0)),
    where_malformed_mean: mean(sessions.map((s) => s.whereMalformed || 0)),
    observation_budget_hits_mean: mean(sessions.map((s) => s.observationBudgetHits || 0)),
    failure_counts: failKinds,
    sessions_failed: sessions.filter((s) => !s.ok).length,
  };
}

/** Pre-committed SPEC rules — do not edit after a gate run has started. */
export const GATE_VERDICT_RULES = {
  id: "cf-mt-real-model-gate-v1",
  models_pin_revision: MODELS_PIN_REVISION,
  pinned_models: { frontier: PINNED_FRONTIER, small: PINNED_SMALL },
  spec: "docs/benchmarks/cloudflare-multiturn/SPEC.md#pre-committed-gate-freeze-before-the-run--do-not-edit-after-seeing-results",
  primary_pair: ["clawql_known_op", "executor_v2"],
  win_requires: [
    "known_op.weighted_tokens_median < executor.weighted_tokens_median",
    "known_op.weighted_tokens_p90 < executor.weighted_tokens_p90",
    "known_op.task_success_rate >= executor.task_success_rate",
    "known_op.observation_tokens_over_ceiling <= executor.observation_tokens_over_ceiling",
  ],
  dual_model_claim:
    "known-op beats code mode for real models — only if win on both frontier and small",
  single_model_claim: "report that model only; not the dual-model claim",
};

function armWinsKnownOp(known, exec) {
  if (!known || known.skipped || !exec || exec.skipped) {
    return { win: false, reason: "missing_arm" };
  }
  const checks = {
    median_weighted:
      known.weighted_tokens_median < exec.weighted_tokens_median,
    p90_weighted: known.weighted_tokens_p90 < exec.weighted_tokens_p90,
    task_success: known.task_success_rate >= exec.task_success_rate,
    over_ceiling:
      known.observation_tokens_over_ceiling <= exec.observation_tokens_over_ceiling,
  };
  return {
    win: Object.values(checks).every(Boolean),
    checks,
    known_op: {
      weighted_tokens_median: known.weighted_tokens_median,
      weighted_tokens_p90: known.weighted_tokens_p90,
      task_success_rate: known.task_success_rate,
      observation_tokens_over_ceiling: known.observation_tokens_over_ceiling,
    },
    executor_v2: {
      weighted_tokens_median: exec.weighted_tokens_median,
      weighted_tokens_p90: exec.weighted_tokens_p90,
      task_success_rate: exec.task_success_rate,
      observation_tokens_over_ceiling: exec.observation_tokens_over_ceiling,
    },
  };
}

export function computeVerdict(summary) {
  const perModel = {};
  for (const [label, block] of Object.entries(summary.results || {})) {
    const arms = block.arms || {};
    perModel[label] = armWinsKnownOp(arms.clawql_known_op, arms.executor_v2);
  }
  const labels = Object.keys(perModel);
  const dualEligible = summary.precommit?.dual_model_claim_eligible === true;
  const wins = labels.filter((l) => perModel[l].win);
  let claim = "no_win";
  let detail = "No model met the pre-committed win rule.";
  if (!dualEligible) {
    claim = "not_dual_model_run";
    detail = `Dual-model claim requires exact pinned IDs ${PINNED_FRONTIER} + ${PINNED_SMALL} (no CF_MT_MODEL override).`;
  } else if (wins.length === labels.length && labels.length >= 2) {
    claim = "known_op_beats_code_mode_for_real_models";
    detail = GATE_VERDICT_RULES.dual_model_claim;
  } else if (wins.length === 1) {
    claim = `win_on_${wins[0]}_only`;
    detail = GATE_VERDICT_RULES.single_model_claim;
  } else if (wins.length > 1 && wins.length < labels.length) {
    claim = "partial_wins";
    detail = `Wins on: ${wins.join(", ")}. Not both models.`;
  }
  return {
    rules_id: GATE_VERDICT_RULES.id,
    per_model: perModel,
    claim,
    detail,
  };
}

async function openArmHandle(arm, mockBase, openapiDoc, closers) {
  if (arm === "cloudflare_codemode") {
    console.log(`[cf-real] skip cloudflare_codemode (hosted / write risk)`);
    return {
      arm,
      skipped: true,
      skipInfo: {
        skipped: true,
        note:
          "Out of real-model gate: hosted Cloudflare code-mode would hit the live API " +
          "(step 12 could write). Scripted board stays tokens-only against the fixture. " +
          "Real-model peers are clawql_* + executor_v2 on the local mock. " +
          "Re-add only with an explicit read-only Cloudflare token policy.",
      },
    };
  }
  if (arm === "clawql_known_op" || arm === "clawql_program") {
    const clawql = await startClawql(mockBase, {
      enablePrograms: arm === "clawql_program",
    });
    closers.push(clawql.close);
    const clientWrap = await connectHttpMcp(clawql.mcpUrl, arm);
    closers.push(clientWrap.close);
    const listed = await clientWrap.client.listTools();
    const names =
      arm === "clawql_program"
        ? ["execute", "execute_program", "search"]
        : ["execute", "search"];
    const filtered = listed.tools.filter((t) => names.includes(t.name));
    const definitionTokens = filtered.reduce((n, t) => n + countTokens(JSON.stringify(t)), 0);
    return {
      arm,
      skipped: false,
      client: clientWrap.client,
      openaiTools: mcpToolsToOpenAI(filtered),
      allowed: new Set(filtered.map((t) => t.name)),
      definitionTokens,
    };
  }
  if (arm === "executor_v2") {
    ensureExecutorOpenapiApp({ mockBase, openapiDoc });
    void executorV2ToolScripts();
    const url = process.env.EXECUTOR_V2_URL || "http://127.0.0.1:4312/mcp";
    const key =
      process.env.EXECUTOR_V2_API_KEY?.trim() ||
      (existsSync("/tmp/executor-v2-data/api_key.txt")
        ? readFileSync("/tmp/executor-v2-data/api_key.txt", "utf8").trim()
        : "");
    if (!key) throw new Error("EXECUTOR_V2_API_KEY required for executor_v2 real-model");
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
    });
    const client = new Client({ name: "cf-real-exec", version: "1" }, {});
    await client.connect(transport);
    closers.push(async () => {
      await client.close().catch(() => {});
    });
    const listed = await client.listTools();
    const executeTool = listed.tools.find((t) => t.name === "execute");
    const toolsForModel = executeTool ? [executeTool] : listed.tools;
    const definitionTokens = toolsForModel.reduce((n, t) => n + countTokens(JSON.stringify(t)), 0);
    return {
      arm,
      skipped: false,
      client,
      openaiTools: mcpToolsToOpenAI(toolsForModel),
      allowed: new Set(["execute"]),
      definitionTokens,
    };
  }
  return {
    arm,
    skipped: true,
    skipInfo: { skipped: true, note: "arm not wired for real-model yet" },
  };
}

async function main() {
  const models = resolveModels();
  if (!API_KEY || !models.length) {
    console.error(
      JSON.stringify(
        {
          error: "missing_model_credentials",
          need: [
            "OPENAI_API_KEY (or OPENROUTER_API_KEY)",
            `CF_MT_MODEL_FRONTIER=${PINNED_FRONTIER}`,
            `CF_MT_MODEL_SMALL=${PINNED_SMALL}`,
          ],
          optional: ["OPENAI_BASE_URL (OpenAI-compatible host for both pinned models)"],
          note: "Set secrets in the environment — never paste keys into chat.",
          precommit_pinned: { frontier: PINNED_FRONTIER, small: PINNED_SMALL },
        },
        null,
        2
      )
    );
    process.exit(2);
  }
  if (!existsSync(FIXTURE) || !existsSync(CURATED_OAS) || !existsSync(join(ROOT, "dist/server-http.js"))) {
    throw new Error("fixture, curated OAS, or dist/server-http.js missing");
  }

  const recording = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const expectations = buildExpectations(recording.world);
  const openapiDoc = JSON.parse(readFileSync(CURATED_OAS, "utf8"));
  mkdirSync(OUT_DIR, { recursive: true });

  const frozenAt = new Date().toISOString();
  const dualEligible = dualModelClaimEligible(models);
  const summary = {
    measuredAt: frozenAt,
    kind: "real_model_validation",
    iters: ITERS,
    temperature: TEMPERATURE,
    baseUrl: BASE_URL,
    models: models.map((m) => ({ label: m.label, id: m.id })),
    arms: ARMS,
    fixture: { source: recording.source, label: recording.label },
    precommit: {
      frozen_at: frozenAt,
      models: models.map((m) => ({ label: m.label, id: m.id })),
      pinned: { frontier: PINNED_FRONTIER, small: PINNED_SMALL },
      models_pin_revision: MODELS_PIN_REVISION,
      temperature: TEMPERATURE,
      system_prompt_shared: true,
      ordering: "interleave_sessions_across_arms",
      arms: [...ARMS],
      iters_per_arm: ITERS,
      token_ceiling: TOKEN_CEILING,
      primary_pair: GATE_VERDICT_RULES.primary_pair,
      comparison_metrics: [
        "weighted_tokens_median",
        "weighted_tokens_p90",
        "observation_tokens_over_ceiling",
        "task_success_rate",
      ],
      verdict_rules: GATE_VERDICT_RULES,
      dual_model_claim_eligible: dualEligible,
      note:
        "Frozen before the first session. Blog/explainer claims must follow verdict_rules; do not re-interpret after seeing results.",
    },
    settings: {
      temperature: TEMPERATURE,
      system_prompt: "shared across arms; tool descriptions from each gateway listTools",
      ordering: "interleave_sessions_across_arms",
      max_turns: MAX_TURNS,
      token_ceiling: TOKEN_CEILING,
      comparison: "real_model_vs_real_model_only",
    },
    results: {},
    verdict: null,
  };

  // Persist precommit immediately so a crash mid-run still leaves the frozen rules.
  const stamp = models.map((m) => m.label).join("_");
  const out = join(OUT_DIR, `real-model-${stamp}-n${ITERS}.json`);
  writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        event: "precommit_frozen",
        wrote: out,
        models: summary.precommit.models,
        dual_model_claim_eligible: dualEligible,
        ordering: summary.precommit.ordering,
        verdict_rules_id: GATE_VERDICT_RULES.id,
      },
      null,
      2
    )
  );

  const mock = await startMock();
  const closers = [async () => mock.child.kill("SIGTERM")];

  try {
    const handles = [];
    for (const arm of ARMS) {
      console.log(`[cf-real] open arm=${arm}`);
      handles.push(await openArmHandle(arm, mock.baseUrl, openapiDoc, closers));
    }

    for (const model of models) {
      summary.results[model.label] = { model: model.id, arms: {} };
      const sessionsByArm = Object.fromEntries(ARMS.map((a) => [a, []]));

      for (let i = 1; i <= ITERS; i++) {
        for (const handle of handles) {
          if (handle.skipped) continue;
          const s = await runToolSession({
            model: model.id,
            arm: handle.arm,
            client: handle.client,
            expectations,
            openaiTools: handle.openaiTools,
            allowedToolNames: handle.allowed,
            definitionTokens: handle.definitionTokens || 0,
          });
          sessionsByArm[handle.arm].push(s);
          console.log(
            `[cf-real] ${model.label}/${handle.arm} ${i}/${ITERS} ok=${s.ok} turns=${s.turns} retries=${s.retries} weighted=${s.weightedTokens} whereBad=${s.whereMalformed}`
          );
        }
      }

      for (const handle of handles) {
        if (handle.skipped) {
          summary.results[model.label].arms[handle.arm] = handle.skipInfo;
        } else {
          summary.results[model.label].arms[handle.arm] = aggregateSessions(
            sessionsByArm[handle.arm]
          );
        }
      }
    }

    summary.verdict = computeVerdict(summary);
  } finally {
    for (const c of closers.reverse()) {
      try {
        await c();
      } catch {
        /* ignore */
      }
    }
  }

  writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");
  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  writeFileSync(
    `/opt/cursor/artifacts/cf-mt-real-model-summary.json`,
    JSON.stringify(summary, null, 2) + "\n"
  );
  console.log(
    JSON.stringify(
      {
        wrote: out,
        kind: summary.kind,
        models: summary.models,
        iters: ITERS,
        ordering: "interleave_sessions_across_arms",
        dual_model_claim_eligible: dualEligible,
        verdict: summary.verdict,
        apiKeySet: true,
      },
      null,
      2
    )
  );
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
