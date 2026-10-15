#!/usr/bin/env node
/**
 * Aggregate Cursor-subagent pilot sessions + optional call JSONL into a report.
 *
 *   node aggregate-cursor-pilot.mjs \
 *     --dir /tmp/cf-mt-real/sessions-blind-v2 \
 *     --kind real_model_cursor_blind_pilot_v2 \
 *     --out docs/benchmarks/cloudflare-multiturn/real-model-cursor-blind-pilot-v2-n5.json
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getEncoding } from "js-tiktoken";

const enc = getEncoding("cl100k_base");
const countTokens = (t) => enc.encode(typeof t === "string" ? t : JSON.stringify(t ?? "")).length;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const dir = arg("--dir");
const kind = arg("--kind", "real_model_cursor_pilot");
const out = arg("--out");
const model = arg("--model", "composer-2.5-fast");
const defTokens = Number(arg("--definition-tokens", "0")) || 0;
if (!dir || !out) {
  console.error("usage: aggregate-cursor-pilot.mjs --dir DIR --out FILE [--kind K] [--definition-tokens N]");
  process.exit(2);
}

const sessions = [];
for (const name of readdirSync(dir).sort()) {
  const m = name.match(/^session-(\d+)\.json$/);
  if (!m) continue;
  const id = Number(m[1]);
  const obsPath = join(dir, name);
  const metaPath = join(dir, `session-${id}-meta.json`);
  const callsPath = join(dir, `session-${id}-calls.jsonl`);
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
  const observations = JSON.parse(readFileSync(obsPath, "utf8"));
  let codeTokens = 0;
  let resultTokens = 0;
  let whereMalformed = meta.whereMalformed ?? 0;
  let toolErrors = meta.toolErrors ?? 0;
  const calls = [];
  if (existsSync(callsPath)) {
    for (const line of readFileSync(callsPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line);
      calls.push(rec);
      codeTokens += rec.code_tokens || 0;
      resultTokens += rec.result_tokens || 0;
    }
    // Prefer JSONL counts when present.
    whereMalformed = calls.filter((c) => c.where_malformed).length;
    toolErrors = calls.filter((c) => c.isError).length;
  } else {
    // Fallback: tokenize final observations only (under-counts retries).
    resultTokens = countTokens(JSON.stringify(observations));
  }
  const combined = defTokens + codeTokens + resultTokens;
  const weighted = defTokens + resultTokens + 5 * codeTokens;
  sessions.push({
    id,
    ok: meta.ok !== false,
    turns: meta.turns ?? null,
    whereAttempts: meta.whereAttempts ?? calls.filter((c) => c.where).length,
    whereMalformed,
    toolErrors,
    cheated: Boolean(meta.cheated),
    notes: meta.notes || "",
    failed: meta.failed || [],
    code_tokens: codeTokens,
    result_tokens: resultTokens,
    definition_tokens: defTokens,
    combined_tokens: combined,
    weighted_tokens: weighted,
    calls: calls.length || undefined,
  });
}

const n = sessions.length || 1;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const report = {
  measuredAt: new Date().toISOString(),
  kind,
  model,
  billing: "cursor_subscription_subagents",
  arm: "clawql_known_op",
  iters: sessions.length,
  honesty: metaHonesty(kind),
  task_success_rate: sessions.filter((s) => s.ok).length / sessions.length,
  where_malformed_total: sessions.reduce((a, s) => a + s.whereMalformed, 0),
  tool_errors_total: sessions.reduce((a, s) => a + s.toolErrors, 0),
  turns_mean: mean(sessions.map((s) => s.turns || 0)),
  turns_median: median(sessions.map((s) => s.turns || 0)),
  definition_tokens: defTokens,
  code_tokens_mean: mean(sessions.map((s) => s.code_tokens)),
  result_tokens_mean: mean(sessions.map((s) => s.result_tokens)),
  result_tokens_median: median(sessions.map((s) => s.result_tokens)),
  combined_tokens_mean: mean(sessions.map((s) => s.combined_tokens)),
  weighted_tokens_mean: mean(sessions.map((s) => s.weighted_tokens)),
  weighted_tokens_median: median(sessions.map((s) => s.weighted_tokens)),
  details: sessions,
};

writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ out, iters: sessions.length, ...pick(report) }, null, 2));

function pick(r) {
  return {
    task_success_rate: r.task_success_rate,
    where_malformed_total: r.where_malformed_total,
    tool_errors_total: r.tool_errors_total,
    turns_mean: r.turns_mean,
    code_tokens_mean: r.code_tokens_mean,
    result_tokens_mean: r.result_tokens_mean,
    weighted_tokens_mean: r.weighted_tokens_mean,
  };
}

function metaHonesty(k) {
  if (k.includes("blind")) {
    return {
      shapesFileHidden: true,
      priorSessionsForbidden: true,
      allowedReads: ["fixture-hint.json", "execute-tool-schema.json", "mcp-url"],
      operationIdsProvided: true,
      note: "Blind: invent JMESPath from execute.where schema (+ product examples) only. Tokens from MCP call JSONL when present.",
    };
  }
  return {
    shapesFileReadableInWorkspace: true,
    operationIdsProvided: true,
    note: "Shapes-visible pilot — not the honest production condition.",
  };
}
