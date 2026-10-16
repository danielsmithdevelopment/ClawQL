#!/usr/bin/env node
/**
 * Fan-out / join board — program promotion signal (ADR 0015).
 *
 *   CF_MT_ITERS=20 node scripts/benchmarks/cloudflare-multiturn/run-fanout-board.mjs
 *
 * Spec: docs/benchmarks/cloudflare-multiturn/fanout-join/SPEC.md
 */
import { spawn } from "node:child_process";
import { createServer as createNetServer, createConnection } from "node:net";
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
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { getEncoding } from "js-tiktoken";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { clawqlEqualArmEnv } from "../lib/clawql-bench-env.mjs";
import {
  FANOUT_CALLS,
  fanoutProgramPlanSource,
  assembleInventoryCard,
} from "./lib/fanout-join-shapes.mjs";
import { buildFanoutExpectations, checkInventoryCard } from "./lib/fanout-join-checks.mjs";
import {
  CLOUDFLARE_CODEMODE_DEFINITION_TOKENS,
  cloudflareCodemodeFanoutJoinScript,
  executorV2FanoutJoinScript,
} from "./code-mode/published-scripts.mjs";
import { ensureExecutorOpenapiApp } from "./lib/ensure-executor-openapi-app.mjs";
import { executorV2ApiKey } from "../lib/find-executor-v2-pid.mjs";

const CODE_PRICE_WEIGHT = Number(process.env.CF_MT_CODE_PRICE_WEIGHT || 5) || 5;
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const FIXTURE = process.env.FIXTURE || join(HERE, "fixtures/recording.synthetic.json");
const CURATED_OAS = join(HERE, "fixtures/curated-openapi.json");
const MOCK_JS = join(HERE, "mock/cloudflare-replay-mock.mjs");
const OUT_DIR =
  process.env.CF_MT_OUT_DIR || join(ROOT, "docs/benchmarks/cloudflare-multiturn/fanout-join");
const ITERS = Math.max(1, Number(process.env.CF_MT_ITERS || 20) || 20);
const REPS = Math.max(1, Number(process.env.CF_MT_REPS || 1) || 1);
const LATENCY = process.env.MT_UPSTREAM_LATENCY || "0";
const FORCE_PUBLISH = ["1", "true", "yes"].includes(
  (process.env.CF_MT_PUBLISH ?? "").trim().toLowerCase()
);
const IS_PUBLISH = ITERS >= 10000 && (REPS >= 3 || FORCE_PUBLISH);
const ABORT_ON_ERROR = ["1", "true", "yes"].includes(
  (process.env.CF_MT_ABORT_ON_ERROR ?? "").trim().toLowerCase()
);
const ARMS = (
  process.env.CF_MT_ARMS || "clawql_known_op,clawql_program,executor_v2,cloudflare_codemode"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const enc = getEncoding("cl100k_base");
function countTokens(text) {
  if (text == null || text === "") return 0;
  return enc.encode(String(text)).length;
}
function toolText(res) {
  const c = res?.content;
  if (!Array.isArray(c)) return "";
  return c.filter((x) => x?.type === "text").map((x) => x.text).join("\n");
}
function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
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
  throw new Error(`waitTcp ${port} timeout`);
}
function parseJsonLoose(text) {
  if (text == null) return null;
  if (typeof text !== "string") return text;
  try {
    return JSON.parse(text);
  } catch {
    const i = text.indexOf("{");
    const j = text.lastIndexOf("}");
    if (i >= 0 && j > i) {
      try {
        return JSON.parse(text.slice(i, j + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const METRICS_POLICY = {
  id: "fanout_join_all_attempted_sessions_primary",
  task_success: "Failed sessions count against task_success_rate.",
  tokens:
    "definition + discovery + result + 5×code; program result = one MCP response (compact plan.return); known-op result = cumulative re-reads; known-op code = full execute args JSON (operationId+args+where) for parity with the plan.",
  model_turns: "Scripted tool rounds (known-op=6, program/code-mode=1).",
  claim: "program_beats_known_op_on_fanout_join — see fanout-join/SPEC.md",
};

async function startMock() {
  const child = spawn(process.execPath, [MOCK_JS], {
    env: { ...process.env, FIXTURE, MT_UPSTREAM_LATENCY: LATENCY },
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
  return { child, baseUrl: ready.baseUrl, pid: child.pid };
}

async function startClawql(mockBase, { enablePrograms = false, label = "clawql" } = {}) {
  const home = join(tmpdir(), `cf-fo-${label}-${process.pid}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(home, { recursive: true });
  const port = await pickPort();
  const env = clawqlEqualArmEnv({
    home,
    specPath: CURATED_OAS,
    apiBase: mockBase,
  });
  Object.assign(env, {
    PORT: String(port),
    MCP_HOST: "127.0.0.1",
    CLOUDFLARE_API_TOKEN: "bench-fake-token",
    CLAWQL_CATALOG_SQLITE: process.env.CLAWQL_CATALOG_SQLITE ?? "1",
    CLAWQL_EXECUTE_RESULT_MAX_CHARS: process.env.CLAWQL_EXECUTE_RESULT_MAX_CHARS || "2000000",
    CLAWQL_SEARCH_COMPACT: "0",
    CLAWQL_ENABLE_PROGRAMS: enablePrograms ? "1" : "0",
  });
  const logPath = join(home, "clawql.log");
  const logFd = openSync(logPath, "w");
  const oldMbRaw = process.env.CLAWQL_NODE_MAX_OLD_SPACE_MB;
  const oldMb =
    oldMbRaw === "0" || oldMbRaw === "false"
      ? null
      : Math.max(64, Number(oldMbRaw || 256) || 256);
  const nodeArgs = oldMb
    ? [`--max-old-space-size=${oldMb}`, join(ROOT, "dist/server-http.js")]
    : [join(ROOT, "dist/server-http.js")];
  const child = spawn(process.execPath, nodeArgs, {
    env,
    stdio: ["ignore", logFd, logFd],
  });
  const mcpUrl = `http://127.0.0.1:${port}/mcp`;
  const deadline = Date.now() + 120000;
  let ready = false;
  while (Date.now() < deadline) {
    if (existsSync(logPath)) {
      const log = readFileSync(logPath, "utf8");
      if (log.includes("listening on") || log.includes("Streamable HTTP MCP")) {
        ready = true;
        break;
      }
      if (log.includes("Fatal startup error")) {
        throw new Error(`clawql failed:\n${log.slice(-2000)}`);
      }
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  if (!ready) {
    throw new Error(`clawql listen timeout:\n${readFileSync(logPath, "utf8").slice(-2000)}`);
  }
  await waitTcp(port, 10000);
  return {
    mcpUrl,
    pid: child.pid,
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

async function connectMcp(url, headers = {}) {
  const client = new Client({ name: "cf-fanout-board", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers },
  });
  await client.connect(transport);
  return client;
}

function summarizeSession(armId, ok, t0, {
  definitionTokens,
  discoveryTokens,
  resultTokens,
  codeTokens,
  modelTurns,
  check,
  error,
  error_kind,
} = {}) {
  const combined = definitionTokens + discoveryTokens + resultTokens + codeTokens;
  const weighted =
    definitionTokens + discoveryTokens + resultTokens + CODE_PRICE_WEIGHT * codeTokens;
  return {
    arm: armId,
    ok: !!ok,
    session_ms: performance.now() - t0,
    model_turns: modelTurns,
    definition_tokens: definitionTokens,
    discovery_tokens: discoveryTokens,
    result_tokens: resultTokens,
    code_tokens: codeTokens,
    combined,
    weighted,
    check,
    error: error ? String(error.message || error) : undefined,
    error_kind,
  };
}

function extractExecuteValue(text) {
  let value = parseJsonLoose(text);
  if (value && typeof value === "object" && Array.isArray(value.content)) {
    const inner = value.content
      .filter((c) => c?.type === "text")
      .map((c) => c.text)
      .join("\n");
    value = parseJsonLoose(inner);
  }
  return value;
}

async function runKnownOpSession(client, expectations, definitionTokens) {
  const t0 = performance.now();
  const byId = {};
  let resultTokens = 0;
  let codeTokens = 0;
  /** Prior observation texts — re-charged each subsequent turn (multiturn honesty). */
  const priorTexts = [];
  try {
    for (const call of FANOUT_CALLS) {
      const execArgs = {
        operationId: call.operationId,
        args: call.args,
        where: call.where,
      };
      // Fair vs program plan: charge the full model-written execute arguments.
      codeTokens += countTokens(JSON.stringify(execArgs));
      const res = await client.callTool({
        name: "execute",
        arguments: execArgs,
      });
      const text = toolText(res);
      if (res.isError) throw new Error(`execute ${call.id}: ${text.slice(0, 300)}`);
      priorTexts.push(text);
      // Turn k: model re-reads observations 1..k
      resultTokens += priorTexts.reduce((n, t) => n + countTokens(t), 0);
      byId[call.id] = extractExecuteValue(text);
    }
    const card = assembleInventoryCard(byId);
    const check = checkInventoryCard(card, expectations);
    return summarizeSession("clawql_known_op", check.ok, t0, {
      definitionTokens,
      discoveryTokens: 0,
      resultTokens,
      codeTokens,
      modelTurns: FANOUT_CALLS.length,
      check,
      error_kind: check.ok ? undefined : "task_check",
    });
  } catch (e) {
    return summarizeSession("clawql_known_op", false, t0, {
      definitionTokens,
      discoveryTokens: 0,
      resultTokens,
      codeTokens,
      modelTurns: FANOUT_CALLS.length,
      error: e,
      error_kind: "tool_error",
    });
  }
}

async function runProgramSession(client, expectations, definitionTokens) {
  const t0 = performance.now();
  const source = fanoutProgramPlanSource();
  const codeTokens = countTokens(source);
  try {
    const res = await client.callTool({
      name: "execute_program",
      arguments: { source, timeoutMs: 60_000 },
    });
    const text = toolText(res);
    if (res.isError) throw new Error(`execute_program: ${text.slice(0, 400)}`);
    const envelope = parseJsonLoose(text);
    if (!envelope?.ok) throw new Error(`execute_program not ok: ${text.slice(0, 400)}`);
    // Honesty: model sees one tool result — charge the MCP response once.
    const resultTokens = countTokens(text);
    // Compact plan.return → result is the card (or legacy { return, results }).
    let card = envelope?.result;
    if (card && typeof card === "object" && card.return) card = card.return;
    if (card && typeof card === "object" && Array.isArray(card.results)) {
      const byId = {};
      for (const call of FANOUT_CALLS) {
        const row = card.results.find((r) => r.id === call.id);
        let value = row?.value;
        if (typeof value === "string") value = parseJsonLoose(value);
        if (value && typeof value === "object" && Array.isArray(value.content)) {
          const inner = value.content
            .filter((c) => c?.type === "text")
            .map((c) => c.text)
            .join("\n");
          value = parseJsonLoose(inner);
        }
        byId[call.id] = value;
      }
      card = assembleInventoryCard(byId);
    }
    const check = checkInventoryCard(card, expectations);
    return summarizeSession("clawql_program", check.ok, t0, {
      definitionTokens,
      discoveryTokens: 0,
      resultTokens,
      codeTokens,
      modelTurns: 1,
      check,
      error_kind: check.ok ? undefined : "task_check",
    });
  } catch (e) {
    return summarizeSession("clawql_program", false, t0, {
      definitionTokens,
      discoveryTokens: 0,
      resultTokens: 0,
      codeTokens,
      modelTurns: 1,
      error: e,
      error_kind: "tool_error",
    });
  }
}

function unwrapExecutorValue(text) {
  let observed = parseJsonLoose(text);
  if (typeof observed === "string") observed = parseJsonLoose(observed);
  if (!observed || typeof observed !== "object") return observed;
  if (observed.execution) {
    if (observed.execution.ok === false) {
      const err = observed.execution.error;
      throw new Error(
        typeof err === "string" ? err : err?.message || JSON.stringify(err).slice(0, 300)
      );
    }
    observed = observed.execution.value;
    if (typeof observed === "string") observed = parseJsonLoose(observed);
  }
  return observed;
}

async function runExecutorFanoutSession(client, script, expectations) {
  const t0 = performance.now();
  const codeTokens = countTokens(script);
  const definitionTokens = countTokens("execute"); // tool name floor; real defs from listTools optional
  try {
    const tools = await client.listTools();
    const defTok = countTokens(JSON.stringify(tools.tools || []));
    const res = await client.callTool({
      name: "execute",
      arguments: { code: script, timeoutMs: 60_000 },
    });
    const text = toolText(res);
    if (res.isError) throw new Error(`executor_v2: ${text.slice(0, 300)}`);
    const card = unwrapExecutorValue(text);
    const check = checkInventoryCard(card, expectations);
    return summarizeSession("executor_v2", check.ok, t0, {
      definitionTokens: defTok || definitionTokens,
      discoveryTokens: 0,
      resultTokens: countTokens(JSON.stringify(card)),
      codeTokens,
      modelTurns: 1,
      check,
      error_kind: check.ok ? undefined : "task_check",
    });
  } catch (e) {
    return summarizeSession("executor_v2", false, t0, {
      definitionTokens,
      discoveryTokens: 0,
      resultTokens: 0,
      codeTokens,
      modelTurns: 1,
      error: e,
      error_kind: "tool_error",
    });
  }
}

function runCloudflareCodemodeTokensOnly(expectations) {
  const t0 = performance.now();
  const script = cloudflareCodemodeFanoutJoinScript();
  const codeTokens = countTokens(script);
  // Tokens-only peer: observation = expected card (script would return this).
  const card = { ...expectations };
  const check = checkInventoryCard(card, expectations);
  return summarizeSession("cloudflare_codemode", check.ok, t0, {
    definitionTokens: CLOUDFLARE_CODEMODE_DEFINITION_TOKENS,
    discoveryTokens: 0,
    resultTokens: countTokens(JSON.stringify(card)),
    codeTokens,
    modelTurns: 1,
    check,
  });
}

/** Arm-specific tool defs only (known-op → execute; program → execute_program). */
async function listClawqlDefinitionTokens(client, toolNames) {
  const tools = await client.listTools();
  const wanted = new Set(toolNames);
  const subset = (tools.tools || []).filter((t) => wanted.has(t.name));
  return countTokens(JSON.stringify(subset.length ? subset : []));
}

function aggregateSessions(armId, sessions) {
  const okSessions = sessions.filter((s) => s.ok);
  const failed = sessions.length - okSessions.length;
  const weighted = sessions.map((s) => s.weighted);
  const combined = sessions.map((s) => s.combined);
  const result = sessions.map((s) => s.result_tokens);
  const code = sessions.map((s) => s.code_tokens);
  const turns = sessions.map((s) => s.model_turns);
  const ms = sessions.map((s) => s.session_ms).sort((a, b) => a - b);
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const errors_by_kind = {};
  for (const s of sessions) {
    if (!s.ok) {
      const k = s.error_kind || "unknown";
      errors_by_kind[k] = (errors_by_kind[k] || 0) + 1;
    }
  }
  return {
    id: armId,
    iters: sessions.length,
    sessions_ok: okSessions.length,
    sessions_failed: failed,
    task_success_rate: sessions.length ? okSessions.length / sessions.length : 0,
    error_rate: sessions.length ? failed / sessions.length : 0,
    errors_by_kind,
    definition_tokens: sessions[0]?.definition_tokens ?? null,
    discovery_tokens_mean: mean(sessions.map((s) => s.discovery_tokens)),
    result_tokens_mean: mean(result),
    code_tokens_mean: mean(code),
    combined_mean: mean(combined),
    weighted_mean: mean(weighted),
    model_turns_mean: mean(turns),
    session_ms: {
      p50: percentile(ms, 50),
      p90: percentile(ms, 90),
      p99: percentile(ms, 99),
      mean: mean(ms),
    },
    first_session: sessions[0]
      ? {
          ok: sessions[0].ok,
          weighted: sessions[0].weighted,
          model_turns: sessions[0].model_turns,
          result_tokens: sessions[0].result_tokens,
          code_tokens: sessions[0].code_tokens,
          check: sessions[0].check,
          error: sessions[0].error,
        }
      : null,
  };
}

async function runArm({ arm, clawqlKnown, clawqlProgram, expectations, executorMeta, iters }) {
  const sessions = [];
  if (arm === "cloudflare_codemode") {
    for (let i = 1; i <= iters; i++) {
      sessions.push(runCloudflareCodemodeTokensOnly(expectations));
    }
    return aggregateSessions(arm, sessions);
  }

  if (arm === "clawql_known_op") {
    if (!clawqlKnown) throw new Error("clawql_known_op requires ClawQL");
    const client = await connectMcp(clawqlKnown.mcpUrl);
    try {
      const defTok = await listClawqlDefinitionTokens(client, ["execute"]);
      for (let i = 1; i <= iters; i++) {
        const s = await runKnownOpSession(client, expectations, defTok);
        sessions.push(s);
        if (!s.ok) {
          console.log(`[fanout] ${arm} ${i}/${iters} ok=false ${s.error_kind || ""} ${s.error || ""}`);
          if (ABORT_ON_ERROR) throw new Error(`${arm} failed at session ${i}`);
        } else if (i === 1 || i === iters || i % Math.max(1, Math.floor(iters / 5)) === 0) {
          console.log(
            `[fanout] ${arm} ${i}/${iters} ok=1 weighted=${s.weighted} turns=${s.model_turns}`
          );
        }
      }
    } finally {
      await client.close().catch(() => {});
    }
    return aggregateSessions(arm, sessions);
  }

  if (arm === "clawql_program") {
    if (!clawqlProgram) throw new Error("clawql_program requires ENABLE_PROGRAMS");
    const client = await connectMcp(clawqlProgram.mcpUrl);
    try {
      const defTok = await listClawqlDefinitionTokens(client, ["execute_program"]);
      for (let i = 1; i <= iters; i++) {
        const s = await runProgramSession(client, expectations, defTok);
        sessions.push(s);
        if (!s.ok) {
          console.log(`[fanout] ${arm} ${i}/${iters} ok=false ${s.error_kind || ""} ${s.error || ""}`);
          if (ABORT_ON_ERROR) throw new Error(`${arm} failed at session ${i}`);
        } else if (i === 1 || i === iters || i % Math.max(1, Math.floor(iters / 5)) === 0) {
          console.log(
            `[fanout] ${arm} ${i}/${iters} ok=1 weighted=${s.weighted} turns=${s.model_turns}`
          );
        }
      }
    } finally {
      await client.close().catch(() => {});
    }
    return aggregateSessions(arm, sessions);
  }

  if (arm === "executor_v2") {
    if (!executorMeta) throw new Error("executor_v2 requires ensureExecutorOpenapiApp");
    const script = executorV2FanoutJoinScript({ appSlug: executorMeta.slug });
    const key = executorV2ApiKey();
    const base =
      process.env.EXECUTOR_MCP_URL ||
      process.env.EXECUTOR_BASE_URL ||
      "http://127.0.0.1:8787/mcp";
    const client = await connectMcp(base, key ? { Authorization: `Bearer ${key}` } : {});
    try {
      for (let i = 1; i <= iters; i++) {
        const s = await runExecutorFanoutSession(client, script, expectations);
        sessions.push(s);
        if (!s.ok) {
          console.log(`[fanout] ${arm} ${i}/${iters} ok=false ${s.error || ""}`);
          if (ABORT_ON_ERROR) throw new Error(`${arm} failed at session ${i}`);
        } else if (i === 1 || i === iters) {
          console.log(`[fanout] ${arm} ${i}/${iters} ok=1 weighted=${s.weighted}`);
        }
      }
    } finally {
      await client.close().catch(() => {});
    }
    return aggregateSessions(arm, sessions);
  }

  throw new Error(`unknown arm ${arm}`);
}

function evaluateClaim(board) {
  const ko = board.clawql_known_op;
  const prog = board.clawql_program;
  if (!ko || !prog) {
    return { id: "program_beats_known_op_on_fanout_join", eligible: false, reason: "missing arms" };
  }
  const checks = {
    weighted: prog.weighted_mean < ko.weighted_mean,
    turns: prog.model_turns_mean < ko.model_turns_mean,
    success: prog.task_success_rate >= ko.task_success_rate,
  };
  // Primary (v0 plan runner): fewer turns + success. Weighted is the token-promotion bar.
  const turns_win = checks.turns && checks.success;
  const token_promotion = checks.weighted && checks.turns && checks.success;
  return {
    id: "program_beats_known_op_on_fanout_join",
    eligible: true,
    turns_win,
    token_promotion,
    win: token_promotion,
    checks,
    known_op: {
      weighted_mean: ko.weighted_mean,
      model_turns_mean: ko.model_turns_mean,
      result_tokens_mean: ko.result_tokens_mean,
      code_tokens_mean: ko.code_tokens_mean,
      definition_tokens: ko.definition_tokens,
      task_success_rate: ko.task_success_rate,
    },
    program: {
      weighted_mean: prog.weighted_mean,
      model_turns_mean: prog.model_turns_mean,
      result_tokens_mean: prog.result_tokens_mean,
      code_tokens_mean: prog.code_tokens_mean,
      definition_tokens: prog.definition_tokens,
      task_success_rate: prog.task_success_rate,
    },
  };
}

async function main() {
  if (!existsSync(join(ROOT, "dist/server-http.js"))) {
    throw new Error("dist/server-http.js missing — build ClawQL first");
  }
  const recording = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const expectations = buildFanoutExpectations(recording.world);
  const openapiDoc = JSON.parse(readFileSync(CURATED_OAS, "utf8"));
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(
    `[fanout] iters=${ITERS} reps=${REPS} publish=${IS_PUBLISH} arms=${ARMS.join(",")} out=${OUT_DIR}`
  );

  const mock = await startMock();
  const closers = [async () => mock.child.kill("SIGTERM")];
  let clawqlKnown = null;
  let clawqlProgram = null;
  let executorMeta = null;

  try {
    if (ARMS.includes("clawql_known_op")) {
      clawqlKnown = await startClawql(mock.baseUrl, { enablePrograms: false, label: "known" });
      closers.push(clawqlKnown.close);
      console.log(`[fanout] clawql_known_op ${clawqlKnown.mcpUrl}`);
    }
    if (ARMS.includes("clawql_program")) {
      clawqlProgram = await startClawql(mock.baseUrl, { enablePrograms: true, label: "program" });
      closers.push(clawqlProgram.close);
      console.log(`[fanout] clawql_program ${clawqlProgram.mcpUrl}`);
    }
    if (ARMS.includes("executor_v2")) {
      console.log(`[fanout] deploying Executor OpenAPI app → ${mock.baseUrl}`);
      executorMeta = ensureExecutorOpenapiApp({ mockBase: mock.baseUrl, openapiDoc });
      console.log(`[fanout] executor app ${executorMeta.slug}`);
    }

    const repBoards = [];
    for (let rep = 1; rep <= REPS; rep++) {
      console.log(`[fanout] === rep ${rep}/${REPS} ===`);
      const board = {};
      for (const arm of ARMS) {
        console.log(`[fanout] run ${arm}`);
        board[arm] = await runArm({
          arm,
          clawqlKnown,
          clawqlProgram,
          expectations,
          executorMeta,
          iters: ITERS,
        });
      }
      const claim = evaluateClaim(board);
      repBoards.push({ rep, board, claim });
      const prefix = IS_PUBLISH ? "board" : "smoke";
      const outRep = join(OUT_DIR, `${prefix}-rep${rep}-n${ITERS}.json`);
      writeFileSync(
        outRep,
        JSON.stringify(
          {
            measuredAt: new Date().toISOString(),
            kind: IS_PUBLISH ? "publish_board" : "smoke",
            workflow: "fanout_join",
            rep,
            iters: ITERS,
            fixture: { source: recording.source, label: recording.label, path: FIXTURE },
            tokenizer: "js-tiktoken cl100k_base",
            metrics_policy: METRICS_POLICY,
            claim,
            board,
          },
          null,
          2
        ) + "\n"
      );
      console.log(`[fanout] wrote ${outRep}`);
      console.log(`[fanout] claim win=${claim.win} ${JSON.stringify(claim.checks || {})}`);
    }

    const summary = {
      measuredAt: new Date().toISOString(),
      kind: IS_PUBLISH ? "publish_board" : "smoke",
      workflow: "fanout_join",
      iters: ITERS,
      reps: REPS,
      arms: ARMS,
      metrics_policy: METRICS_POLICY,
      claim_across_reps: repBoards.map((r) => r.claim),
      range_across_reps: {},
      latest: repBoards.at(-1)?.board,
      latest_claim: repBoards.at(-1)?.claim,
    };
    for (const arm of ARMS) {
      const rows = repBoards.map((r) => r.board[arm]).filter(Boolean);
      summary.range_across_reps[arm] = {
        task_success_rate: rows.map((r) => r.task_success_rate),
        weighted_mean: rows.map((r) => r.weighted_mean),
        model_turns_mean: rows.map((r) => r.model_turns_mean),
        result_tokens_mean: rows.map((r) => r.result_tokens_mean),
        code_tokens_mean: rows.map((r) => r.code_tokens_mean),
        session_p50_ms: rows.map((r) => r.session_ms?.p50),
      };
    }
    const prefix = IS_PUBLISH ? "board" : "smoke";
    const summaryPath = join(OUT_DIR, `${prefix}-summary-n${ITERS}-r${REPS}.json`);
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n");
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    writeFileSync(
      `/opt/cursor/artifacts/cloudflare-fanout-${prefix}-summary.json`,
      JSON.stringify(summary, null, 2) + "\n"
    );
    console.log(JSON.stringify({ wrote: summaryPath, claim: summary.latest_claim }, null, 2));
  } finally {
    for (const c of closers.reverse()) {
      try {
        await c();
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
