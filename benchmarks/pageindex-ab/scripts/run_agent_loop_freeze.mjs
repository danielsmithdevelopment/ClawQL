#!/usr/bin/env node
/**
 * Strong-model agent-loop freeze (Track B).
 *
 * Product question: does adding codegraph_* improve today's default (grep)?
 * Treatment A-codegraph = grep + codegraph_* (additive).
 *
 * Usage:
 *   node benchmarks/pageindex-ab/scripts/run_agent_loop_freeze.mjs --dry-run \
 *     --cohort codegraph-prove --arms A-no-tools,A-grep,A-codegraph
 *   OPENROUTER_API_KEY=… node …/run_agent_loop_freeze.mjs \
 *     --cohort codegraph-prove --arms A-no-tools,A-grep,A-codegraph
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureCodeGraph,
  openAiToolsForArm,
  runTool,
  isCodegraphTool,
  resolveRepoRoot,
} from "./agent_loop_tools.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO = resolveRepoRoot(__dirname);
const LOCK_PATH = path.join(ROOT, "design", "codegraph-prove-decision.lock.json");
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function parseArgs(argv) {
  const out = {
    dryRun: false,
    corpus: "clawql-monorepo",
    cohort: "codegraph-prove",
    arms: ["A-no-tools", "A-grep", "A-codegraph"],
    model:
      process.env.PAGEINDEX_AB_AGENT_MODEL ||
      process.env.VECTIFY_FAIR_MODEL ||
      "anthropic/claude-sonnet-4.6",
    out: path.join(ROOT, "results", "agent-loop-freeze"),
    maxToolCalls: 12,
    limit: 0, // 0 = all
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--corpus") out.corpus = argv[++i];
    else if (a === "--cohort") out.cohort = argv[++i];
    else if (a === "--arms") out.arms = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--model") out.model = argv[++i];
    else if (a === "--out") out.out = path.resolve(argv[++i]);
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--max-tool-calls") out.maxToolCalls = Number(argv[++i]);
  }
  return out;
}

const ARM_TOOLS = {
  "A-no-tools": [],
  "A-grep": ["grep", "read_around"],
  "A-codegraph": [
    "grep",
    "read_around",
    "codegraph_explore",
    "codegraph_impact",
    "codegraph_neighbors",
    "codegraph_path",
    "codegraph_query",
  ],
  "A-codegraph-only": [
    "codegraph_explore",
    "codegraph_impact",
    "codegraph_neighbors",
    "codegraph_path",
    "codegraph_query",
    "read_around",
  ],
};

const CODEGRAPH_TOOL_NAMES = [
  "codegraph_explore",
  "codegraph_impact",
  "codegraph_neighbors",
  "codegraph_path",
  "codegraph_query",
  "codegraph_explain",
  "codegraph_subgraph",
  "codegraph_index",
  "codegraph_sync",
];

function loadCodegraphCohorts() {
  const prove = JSON.parse(
    fs.readFileSync(path.join(ROOT, "design", "codegraph-prove-keys.oracle.json"), "utf8")
  );
  const noHarm = JSON.parse(
    fs.readFileSync(path.join(ROOT, "design", "codegraph-no-harm-keys.json"), "utf8")
  );
  return {
    prove_keys: prove.keys || [],
    no_harm_keys: noHarm.keys || [],
  };
}

function normalize(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s.\-/%]/g, "")
    .replace(/\s+/g, " ");
}

function gradeAnswer(key, answer) {
  const ans = normalize(answer);
  if (!ans) return false;
  if (key.normalized_answer) {
    if (ans.includes(normalize(key.normalized_answer))) return true;
  }
  for (const v of key.accepted_variants || []) {
    if (ans.includes(normalize(v))) return true;
  }
  // Prove keys: accept if ≥2 gold impacted names / files appear
  const names = key.gold?.impacted_names || key.gold?.neighbor_names || [];
  const files = key.gold?.files || [];
  const hits = [...names, ...files].filter((x) => ans.includes(normalize(x)));
  if (names.length || files.length) return hits.length >= Math.min(2, names.length || files.length || 1);
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isInFlightBudget402(status, text) {
  if (status !== 402) return false;
  const s = String(text || "").toLowerCase();
  return (
    s.includes("in_flight_budget") ||
    s.includes("in-flight") ||
    s.includes("retry after in-flight")
  );
}

async function openRouterChat({ apiKey, model, messages, tools }) {
  const body = {
    model: model.startsWith("openrouter/") ? model.slice("openrouter/".length) : model,
    messages,
    temperature: 0,
  };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  } else {
    body.response_format = { type: "json_object" };
  }
  const maxAttempts = Number(process.env.PAGEINDEX_AB_OR_402_RETRIES || 6);
  let backoffMs = Number(process.env.PAGEINDEX_AB_OR_402_BACKOFF_MS || 60_000);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.CLAWQL_OPENROUTER_HTTP_REFERER || "https://clawql.com",
        "X-Title": process.env.CLAWQL_OPENROUTER_APP_TITLE || "ClawQL Track B agent-loop",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) return JSON.parse(text);

    if (isInFlightBudget402(res.status, text) && attempt < maxAttempts) {
      const hdr = res.headers.get("retry-after");
      const waitSec = hdr && Number(hdr) > 0 ? Number(hdr) : Math.ceil(backoffMs / 1000);
      console.error(
        JSON.stringify({
          openrouter_retry: true,
          reason: "in_flight_budget_exhausted",
          attempt,
          maxAttempts,
          wait_sec: waitSec,
        })
      );
      await sleep(waitSec * 1000);
      backoffMs = Math.min(backoffMs * 2, 300_000);
      continue;
    }

    const err = new Error(`OpenRouter ${res.status}: ${text.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }
}

async function runCell({ apiKey, model, armId, key, toolCtx, maxToolCalls }) {
  const tools = openAiToolsForArm(ARM_TOOLS[armId] || []);
  const system = [
    "You answer questions about the ClawQL TypeScript monorepo.",
    "Use tools when available. Prefer precise symbol/file names.",
    'When done, reply with ONLY JSON: {"answer":"...","not_found":false}',
  ].join(" ");
  const messages = [
    { role: "system", content: system },
    { role: "user", content: key.question },
  ];
  const used = new Set();
  let toolCalls = 0;

  for (let turn = 0; turn < maxToolCalls + 2; turn++) {
    const data = await openRouterChat({
      apiKey,
      model,
      messages,
      tools: tools.length ? tools : undefined,
    });
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error("empty OpenRouter message");
    messages.push(msg);
    const tcalls = msg.tool_calls || [];
    if (!tcalls.length) {
      let answer = msg.content || "";
      try {
        const j = JSON.parse(answer);
        answer = j.answer ?? answer;
      } catch {
        /* plain text */
      }
      return {
        answer,
        used_codegraph: [...used].some(isCodegraphTool),
        codegraph_tools_used: [...used].filter(isCodegraphTool),
        tool_calls: toolCalls,
      };
    }
    for (const tc of tcalls) {
      toolCalls++;
      const name = tc.function?.name || "";
      used.add(name);
      let args = {};
      try {
        args = JSON.parse(tc.function?.arguments || "{}");
      } catch {
        args = {};
      }
      const content = runTool(name, args, toolCtx);
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content,
      });
    }
    if (toolCalls >= maxToolCalls) {
      messages.push({
        role: "user",
        content: 'Stop calling tools. Reply with JSON {"answer":"...","not_found":false} now.',
      });
    }
  }
  return {
    answer: "",
    used_codegraph: [...used].some(isCodegraphTool),
    codegraph_tools_used: [...used].filter(isCodegraphTool),
    tool_calls: toolCalls,
    error: "max_turns",
  };
}

async function runLive(args, lock, proveKeys, noHarmKeys) {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) {
    const report = {
      ok: false,
      blockers: [
        {
          code: "missing_openrouter",
          message: "OPENROUTER_API_KEY is required for Track B live spend",
          remedy: "Add the secret to the Cloud Agent environment, then re-run without --dry-run",
        },
      ],
    };
    fs.writeFileSync(
      path.join(args.out, "agent-blocker-report.json"),
      JSON.stringify(report, null, 2) + "\n"
    );
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 2;
    return;
  }

  console.error(JSON.stringify({ indexing: true, roots: 4 }));
  const { doc } = await ensureCodeGraph(REPO);
  console.error(
    JSON.stringify({ indexed: true, nodeCount: doc.nodeCount, edgeCount: doc.edgeCount })
  );
  const toolCtx = { repoRoot: REPO, doc };

  let keys = [...proveKeys, ...noHarmKeys];
  if (args.limit > 0) keys = keys.slice(0, args.limit);

  const answersPath = path.join(args.out, "answers.jsonl");
  const done = new Set();
  // Drop incomplete/error rows (esp. OpenRouter 402) so resume retries them.
  if (fs.existsSync(answersPath)) {
    const kept = [];
    for (const line of fs.readFileSync(answersPath, "utf8").split("\n").filter(Boolean)) {
      const r = JSON.parse(line);
      if (r.error) continue;
      kept.push(line);
      done.add(`${r.arm}\t${r.question_id}`);
    }
    fs.writeFileSync(answersPath, kept.length ? kept.join("\n") + "\n" : "");
  }

  const cells = [];
  for (const arm of args.arms) {
    for (const key of keys) {
      const id = key.id;
      if (done.has(`${arm}\t${id}`)) continue;
      cells.push({ arm, key });
    }
  }
  console.error(JSON.stringify({ cells: cells.length, resume_done: done.size, model: args.model }));

  for (const cell of cells) {
    process.stderr.write(`${cell.arm} ${cell.key.id} … `);
    try {
      const result = await runCell({
        apiKey,
        model: args.model,
        armId: cell.arm,
        key: cell.key,
        toolCtx,
        maxToolCalls: args.maxToolCalls,
      });
      const answer_ok = gradeAnswer(cell.key, result.answer);
      const row = {
        question_id: cell.key.id,
        arm: cell.arm,
        cohort: proveKeys.some((k) => k.id === cell.key.id) ? "prove" : "no_harm",
        answer: result.answer,
        answer_ok,
        used_codegraph: result.used_codegraph,
        codegraph_tools_used: result.codegraph_tools_used,
        tool_calls: result.tool_calls,
        model: args.model,
      };
      fs.appendFileSync(answersPath, JSON.stringify(row) + "\n");
      process.stderr.write(`${answer_ok ? "ok" : "miss"} tools=${result.tool_calls}\n`);
    } catch (err) {
      process.stderr.write(`ERR ${err.message}\n`);
      fs.appendFileSync(
        answersPath,
        JSON.stringify({
          question_id: cell.key.id,
          arm: cell.arm,
          answer: "",
          answer_ok: false,
          error: String(err.message || err),
          model: args.model,
        }) + "\n"
      );
      if (String(err.message || "").includes("402") || String(err.message || "").includes("credit")) {
        console.error(JSON.stringify({ fatal: "insufficient_credits" }));
        process.exitCode = 5;
        return;
      }
    }
  }

  // Auto-score beat
  const { spawnSync } = await import("node:child_process");
  const scored = spawnSync(
    process.execPath,
    [path.join(__dirname, "decide_codegraph_beat.mjs"), answersPath],
    { encoding: "utf8" }
  );
  process.stdout.write(scored.stdout || "");
  if (scored.status && scored.status !== 0 && scored.status !== 2) {
    process.exitCode = scored.status;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const lock = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
  const { prove_keys: proveKeys, no_harm_keys: noHarmKeys } = loadCodegraphCohorts();
  const proveIds = proveKeys.map((k) => k.id);
  const noHarmIds = noHarmKeys.map((k) => k.id);
  const questionIds = [...proveIds, ...noHarmIds];

  const requiredArms = ["A-no-tools", "A-grep", "A-codegraph"];
  const missing = requiredArms.filter((a) => !args.arms.includes(a));
  if (args.cohort === "codegraph-prove" && missing.length) {
    console.error(
      JSON.stringify({
        ok: false,
        error: `codegraph-prove cohort requires arms ${requiredArms.join(",")}; missing ${missing.join(",")}`,
      })
    );
    process.exitCode = 2;
    return;
  }

  const treatmentTools = ARM_TOOLS["A-codegraph"] || [];
  if (!treatmentTools.includes("grep") || !treatmentTools.some((t) => t.startsWith("codegraph_"))) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "A-codegraph treatment arm must include both grep and codegraph_* tools (additive).",
      })
    );
    process.exitCode = 2;
    return;
  }

  fs.mkdirSync(args.out, { recursive: true });
  const manifest = {
    suite: "agent-loop-freeze",
    status: args.dryRun ? "scheduled-dry-run" : "live",
    freeze: "2026-10-15",
    track: "B",
    product_question: lock.product_question,
    design: "benchmarks/pageindex-ab/design/agent-loop-freeze.md",
    decision_lock: "benchmarks/pageindex-ab/design/codegraph-prove-decision.lock.json",
    decision_lock_status: lock.status,
    clear_to_sign: lock.clear_to_sign === true,
    human_pass: "benchmarks/pageindex-ab/design/HUMAN_PASS_RESULT.json",
    beat: lock.beat,
    corpus: args.corpus,
    cohort: args.cohort,
    n_prove: proveIds.length,
    n_no_harm: noHarmIds.length,
    n: questionIds.length,
    prove_ids: proveIds,
    no_harm_ids: noHarmIds,
    question_ids: questionIds,
    model: args.model,
    arms: args.arms.map((id) => ({
      id,
      role:
        id === "A-codegraph"
          ? "treatment"
          : id === "A-grep"
            ? "control"
            : id === "A-codegraph-only"
              ? "diagnostic"
              : id === "A-no-tools"
                ? "baseline"
                : "other",
      tools: ARM_TOOLS[id] || [],
      setup: id === "A-codegraph" || id === "A-codegraph-only" ? ["codegraph_sync"] : [],
      counts_toward_net: id === "A-grep" || id === "A-codegraph",
    })),
    usage_evidence: {
      arm: "A-codegraph",
      codegraph_tool_names: CODEGRAPH_TOOL_NAMES,
      record_per_question: ["codegraph_tool_calls", "codegraph_tools_used", "used_codegraph"],
    },
    decision:
      "Keep codegraph_* only if Net>=5 (grep+CodeGraph vs grep) AND no-harm pass; tie/no-harm fail => purge.",
    has_openrouter: Boolean(process.env.OPENROUTER_API_KEY),
  };
  const outPath = path.join(args.out, "schedule-manifest.json");
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, wrote: outPath, dryRun: args.dryRun }, null, 2));

  if (args.dryRun) return;
  await runLive(args, lock, proveKeys, noHarmKeys);
}

main().catch((err) => {
  console.error(err);
  process.exit(3);
});
