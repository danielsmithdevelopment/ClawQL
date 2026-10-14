#!/usr/bin/env node
/**
 * Real-model validation (SPEC): 50 sessions per arm × model, mock only.
 *
 * Secrets (never paste into chat / logs):
 *   OPENAI_API_KEY          — required
 *   OPENAI_BASE_URL         — optional (default https://api.openai.com/v1)
 *   CF_MT_MODEL_FRONTIER    — frontier model id
 *   CF_MT_MODEL_SMALL       — smaller/cheaper model id
 *   CF_MT_MODEL             — optional single-model override (runs that one only)
 *
 *   CF_MT_REAL_ITERS=50 CF_MT_REAL_ARMS=clawql_known_op,clawql_program,executor_v2 \
 *     npm run benchmark:cloudflare-multiturn:real-model
 *
 * Settings fixed across arms: temperature 0, shared system prompt, each gateway's
 * own tool descriptions from listTools. Reports failures (malformed where, retries,
 * turns) alongside tokens and task success.
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
import { fileURLToPath } from "node:url";
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
const TEMPERATURE = 0;
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
  const frontier = process.env.CF_MT_MODEL_FRONTIER || "";
  const small = process.env.CF_MT_MODEL_SMALL || "";
  const out = [];
  if (frontier) out.push({ id: frontier, label: "frontier" });
  if (small) out.push({ id: small, label: "small" });
  return out;
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
}) {
  const t0 = performance.now();
  const observations = {};
  const failures = [];
  let turns = 0;
  let retries = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let toolCalls = 0;
  let whereAttempts = 0;
  let whereMalformed = 0;

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
        const res = await client.callTool({ name, arguments: args });
        resultText = toolText(res);
        const classified = classifyToolFailure(name, args, resultText);
        for (const f of classified) {
          failures.push(f);
          if (f.kind === "malformed_where") {
            whereMalformed++;
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

  return {
    ok,
    turns,
    retries,
    toolCalls,
    inputTokens,
    outputTokens,
    whereAttempts,
    whereMalformed,
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
  return {
    task_success_rate: sessions.filter((s) => s.ok).length / sessions.length,
    turns_mean: sessions.reduce((a, s) => a + s.turns, 0) / n,
    retries_mean: sessions.reduce((a, s) => a + s.retries, 0) / n,
    tool_calls_mean: sessions.reduce((a, s) => a + s.toolCalls, 0) / n,
    input_tokens_mean: sessions.reduce((a, s) => a + s.inputTokens, 0) / n,
    output_tokens_mean: sessions.reduce((a, s) => a + s.outputTokens, 0) / n,
    session_ms_mean: sessions.reduce((a, s) => a + s.session_ms, 0) / n,
    where_attempts_mean: sessions.reduce((a, s) => a + (s.whereAttempts || 0), 0) / n,
    where_malformed_mean: sessions.reduce((a, s) => a + (s.whereMalformed || 0), 0) / n,
    failure_counts: failKinds,
    sessions_failed: sessions.filter((s) => !s.ok).length,
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
            "CF_MT_MODEL_FRONTIER and CF_MT_MODEL_SMALL (or CF_MT_MODEL for one model)",
          ],
          optional: ["OPENAI_BASE_URL"],
          note: "Set secrets in the environment — never paste keys into chat.",
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

  const mock = await startMock();
  const closers = [async () => mock.child.kill("SIGTERM")];
  let executorMeta = null;
  const execScripts = executorV2ToolScripts();

  const summary = {
    measuredAt: new Date().toISOString(),
    kind: "real_model_validation",
    iters: ITERS,
    temperature: TEMPERATURE,
    baseUrl: BASE_URL,
    models: models.map((m) => ({ label: m.label, id: m.id })),
    arms: ARMS,
    fixture: { source: recording.source, label: recording.label },
    settings: {
      temperature: TEMPERATURE,
      system_prompt: "shared across arms; tool descriptions from each gateway listTools",
      max_turns: MAX_TURNS,
    },
    results: {},
  };

  try {
    if (ARMS.includes("executor_v2")) {
      executorMeta = ensureExecutorOpenapiApp({ mockBase: mock.baseUrl, openapiDoc });
    }

    for (const model of models) {
      summary.results[model.label] = { model: model.id, arms: {} };
      for (const arm of ARMS) {
        console.log(`[cf-real] model=${model.label} arm=${arm}`);
        let clientWrap = null;
        let openaiTools = null;
        let allowed = new Set();
        let clawql = null;

        if (arm === "clawql_known_op" || arm === "clawql_program") {
          clawql = await startClawql(mock.baseUrl, {
            enablePrograms: arm === "clawql_program",
          });
          closers.push(clawql.close);
          clientWrap = await connectHttpMcp(clawql.mcpUrl, arm);
          const listed = await clientWrap.client.listTools();
          const names =
            arm === "clawql_program"
              ? ["execute", "execute_program", "search"]
              : ["execute", "search"];
          const filtered = listed.tools.filter((t) => names.includes(t.name));
          allowed = new Set(filtered.map((t) => t.name));
          openaiTools = mcpToolsToOpenAI(filtered);
        } else if (arm === "executor_v2") {
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
          clientWrap = {
            client,
            close: async () => {
              await client.close().catch(() => {});
            },
          };
          const listed = await client.listTools();
          const executeTool = listed.tools.find((t) => t.name === "execute");
          allowed = new Set(["execute"]);
          openaiTools = mcpToolsToOpenAI(executeTool ? [executeTool] : listed.tools);
          // Hint: model writes JS into execute.code — scripts in published-scripts are the scripted peer.
          void execScripts;
          void executorMeta;
        } else {
          summary.results[model.label].arms[arm] = {
            skipped: true,
            note: "arm not wired for real-model yet",
          };
          continue;
        }

        const sessions = [];
        try {
          for (let i = 1; i <= ITERS; i++) {
            const s = await runToolSession({
              model: model.id,
              arm,
              client: clientWrap.client,
              expectations,
              openaiTools,
              allowedToolNames: allowed,
            });
            sessions.push(s);
            console.log(
              `[cf-real] ${model.label}/${arm} ${i}/${ITERS} ok=${s.ok} turns=${s.turns} retries=${s.retries} whereBad=${s.whereMalformed}`
            );
          }
        } finally {
          await clientWrap.close();
        }
        summary.results[model.label].arms[arm] = aggregateSessions(sessions);
      }
    }
  } finally {
    for (const c of closers.reverse()) {
      try {
        await c();
      } catch {
        /* ignore */
      }
    }
  }

  const stamp = models.map((m) => m.label).join("_");
  const out = join(OUT_DIR, `real-model-${stamp}-n${ITERS}.json`);
  writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(`/opt/cursor/artifacts/cf-mt-real-model-summary.json`, JSON.stringify(summary, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        wrote: out,
        kind: summary.kind,
        models: summary.models,
        iters: ITERS,
        // never echo key material
        apiKeySet: true,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
