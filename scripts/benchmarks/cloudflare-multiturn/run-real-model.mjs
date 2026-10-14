#!/usr/bin/env node
/**
 * Real-model validation (SPEC): 50 sessions per arm, pinned model, mock only.
 *
 *   CF_MT_MODEL=openai/gpt-4.1-mini OPENAI_API_KEY=… \
 *   CF_MT_REAL_ITERS=50 CF_MT_REAL_ARMS=clawql_known_op,clawql_program,executor_v2 \
 *     npm run benchmark:cloudflare-multiturn:real-model
 *
 * Requires an OpenAI-compatible Chat Completions API (OPENAI_API_KEY + optional
 * OPENAI_BASE_URL). Does not publish into the scripted board table.
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

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const FIXTURE = process.env.FIXTURE || join(HERE, "fixtures/recording.synthetic.json");
const CURATED_OAS = join(HERE, "fixtures/curated-openapi.json");
const MOCK_JS = join(HERE, "mock/cloudflare-replay-mock.mjs");
const OUT_DIR = process.env.CF_MT_OUT_DIR || join(ROOT, "docs/benchmarks/cloudflare-multiturn");
const ITERS = Math.max(1, Number(process.env.CF_MT_REAL_ITERS || 50) || 50);
const MODEL = process.env.CF_MT_MODEL || process.env.OPENAI_MODEL || "";
const API_KEY = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || "";
const BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const ARMS = (
  process.env.CF_MT_REAL_ARMS ||
  "clawql_known_op,clawql_program,executor_v2,cloudflare_codemode"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_TURNS = Math.max(4, Number(process.env.CF_MT_REAL_MAX_TURNS || 24) || 24);
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

async function chatCompletions({ messages, tools }) {
  const body = {
    model: MODEL,
    messages,
    temperature: 0,
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

function systemPrompt(arm) {
  return [
    "You are validating a 12-step Cloudflare zone audit against a local mock via MCP tools.",
    `Arm: ${arm}. Fixture zone name: ${FAKE.auditZoneName}. Target IP: ${FAKE.targetIp}.`,
    "Use tools only. Prefer lean responses.",
    arm.startsWith("clawql")
      ? "For ClawQL execute, use JMESPath `where` (server-side) to return only the observation you need — e.g. counts via length(), name lists, scalars. Do not dump full DNS rows."
      : "For code mode, write a short program that filters in the sandbox and returns only the observation object.",
    "Finish by calling the harness-facing summary: return JSON for steps 1–12 matching the check schema when you are done, or keep using tools until each step is satisfied.",
    "Step 12 is a gated proposal only: { proposal: { recordId, proxied: true }, gated: true } — do not PATCH.",
  ].join("\n");
}

function clawqlTools(includeProgram) {
  const tools = [
    {
      type: "function",
      function: {
        name: "execute",
        description:
          "Run one OpenAPI operation. Optional where = JMESPath filter/extract (server-side; length() ok).",
        parameters: {
          type: "object",
          properties: {
            operationId: { type: "string" },
            args: { type: "object" },
            where: { type: "string", description: "JMESPath, max 512 chars" },
            fields: { type: "array", items: { type: "string" } },
          },
          required: ["operationId"],
        },
      },
    },
  ];
  if (includeProgram) {
    tools.push({
      type: "function",
      function: {
        name: "execute_program",
        description: "Run a read-only JSON plan of execute/search calls in one round trip.",
        parameters: {
          type: "object",
          properties: {
            source: { type: "string", description: "JSON plan string" },
            timeoutMs: { type: "number" },
          },
          required: ["source"],
        },
      },
    });
  }
  tools.push({
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
  return tools;
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

async function connectHttpMcp(mcpUrl) {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
  const client = new Client({ name: "cf-real-model", version: "1" }, {});
  await client.connect(transport);
  return {
    client,
    close: async () => {
      await client.close().catch(() => {});
    },
  };
}

async function runClawqlModelSession(client, expectations, { program = false } = {}) {
  const t0 = performance.now();
  const observations = {};
  let turns = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let toolCalls = 0;
  const messages = [
    { role: "system", content: systemPrompt(program ? "clawql_program" : "clawql_known_op") },
    {
      role: "user",
      content:
        "Complete the 12-step zone audit. Known useful operationIds include: " +
        Object.values(CLAWQL_STEP_SHAPES)
          .map((s) => s.operationId)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(", ") +
        ". Submit each step observation via submit_observation.",
    },
  ];
  const tools = clawqlTools(program);

  while (turns < MAX_TURNS) {
    turns++;
    const completion = await chatCompletions({ messages, tools });
    const choice = completion.choices?.[0]?.message;
    if (!choice) throw new Error("empty model message");
    inputTokens += completion.usage?.prompt_tokens || countTokens(JSON.stringify(messages));
    outputTokens +=
      completion.usage?.completion_tokens || countTokens(JSON.stringify(choice.content || "")) +
      countTokens(JSON.stringify(choice.tool_calls || []));
    messages.push(choice);
    const calls = choice.tool_calls || [];
    if (!calls.length) {
      if (Object.keys(observations).length >= 12) break;
      messages.push({
        role: "user",
        content: `Still missing steps: ${[...Array(12)].map((_, i) => i + 1).filter((s) => !observations[s]).join(", ")}`,
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
        args = {};
      }
      let resultText = "";
      if (name === "submit_observation") {
        observations[args.step] = args.observation;
        resultText = JSON.stringify({ ok: true, step: args.step });
      } else if (name === "execute" || name === "execute_program") {
        const res = await client.callTool({ name, arguments: args });
        resultText = toolText(res);
      } else {
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
  }
  return {
    ok,
    turns,
    toolCalls,
    inputTokens,
    outputTokens,
    session_ms: performance.now() - t0,
    stepChecks,
  };
}

async function main() {
  if (!API_KEY || !MODEL) {
    console.error(
      JSON.stringify(
        {
          error: "missing_model_credentials",
          need: ["CF_MT_MODEL (or OPENAI_MODEL)", "OPENAI_API_KEY or OPENROUTER_API_KEY"],
          optional: ["OPENAI_BASE_URL"],
          note: "Real-model 50-session run blocked until a chat-completions key is available.",
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
  mkdirSync(OUT_DIR, { recursive: true });

  const mock = await startMock();
  const closers = [async () => mock.child.kill("SIGTERM")];
  const summary = {
    measuredAt: new Date().toISOString(),
    kind: "real_model_validation",
    iters: ITERS,
    model: MODEL,
    baseUrl: BASE_URL,
    arms: ARMS,
    fixture: { source: recording.source, label: recording.label },
    results: {},
  };

  try {
    for (const arm of ARMS) {
      console.log(`[cf-real] arm=${arm}`);
      if (arm === "cloudflare_codemode") {
        summary.results[arm] = {
          note: "tokens-only arm — real-model CF self-host not wired; skipped",
          skipped: true,
        };
        continue;
      }
      if (arm === "executor_v2") {
        summary.results[arm] = {
          note: "executor real-model path not wired in this scaffold; use clawql_* first",
          skipped: true,
        };
        continue;
      }
      if (!arm.startsWith("clawql_")) {
        summary.results[arm] = { skipped: true, note: "arm not in real-model scaffold yet" };
        continue;
      }
      const clawql = await startClawql(mock.baseUrl, {
        enablePrograms: arm === "clawql_program",
      });
      closers.push(clawql.close);
      const conn = await connectHttpMcp(clawql.mcpUrl);
      const sessions = [];
      try {
        for (let i = 1; i <= ITERS; i++) {
          const s = await runClawqlModelSession(conn.client, expectations, {
            program: arm === "clawql_program",
          });
          sessions.push(s);
          console.log(
            `[cf-real] ${arm} ${i}/${ITERS} ok=${s.ok} turns=${s.turns} outTok=${s.outputTokens}`
          );
          if (!s.ok) {
            console.error(JSON.stringify(s.stepChecks.filter((c) => !c.ok), null, 2));
          }
        }
      } finally {
        await conn.close();
      }
      summary.results[arm] = {
        task_success_rate: sessions.filter((s) => s.ok).length / sessions.length,
        turns_mean: sessions.reduce((n, s) => n + s.turns, 0) / sessions.length,
        tool_calls_mean: sessions.reduce((n, s) => n + s.toolCalls, 0) / sessions.length,
        input_tokens_mean: sessions.reduce((n, s) => n + s.inputTokens, 0) / sessions.length,
        output_tokens_mean: sessions.reduce((n, s) => n + s.outputTokens, 0) / sessions.length,
        session_ms_mean: sessions.reduce((n, s) => n + s.session_ms, 0) / sessions.length,
        sessions,
      };
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

  const out = join(OUT_DIR, `real-model-${MODEL.replace(/[^\w.-]+/g, "_")}-n${ITERS}.json`);
  writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(`/opt/cursor/artifacts/cf-mt-real-model-summary.json`, JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify({ wrote: out, kind: summary.kind, model: MODEL, iters: ITERS }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
