#!/usr/bin/env node
/**
 * Aggregate fan-out Cursor-gate sessions + SPEC verdict (program vs known-op).
 *
 *   node lib/aggregate-fanout-cursor-gate.mjs --state /tmp/cf-mt-fanout-gate
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../..");
const OUT_DIR = join(ROOT, "docs/benchmarks/cloudflare-multiturn/fanout-join");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const STATE = arg("--state", "/tmp/cf-mt-fanout-gate");
const TOKEN_CEILING = Math.max(
  1000,
  Number(process.env.CF_MT_REAL_TOKEN_CEILING || 10_000) || 10_000
);

const precommit = JSON.parse(readFileSync(join(STATE, "precommit.json"), "utf8"));
const models = precommit.models;
const arms = precommit.arms;
const CODE_WEIGHT = 5;

function percentileSorted(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}
function medianSorted(sorted) {
  if (!sorted.length) return 0;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}
function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
}

/** Cumulative re-reads: turn k charges sum of result_tokens for calls 1..k. */
function cumulativeObservation(resultTokenSeq) {
  let total = 0;
  let running = 0;
  for (const t of resultTokenSeq) {
    running += t;
    total += running;
  }
  return total;
}

function loadArmSessions(modelLabel, arm) {
  const dir = join(STATE, "sessions", modelLabel, arm);
  if (!existsSync(dir)) return [];
  const sessions = [];
  for (const name of readdirSync(dir).sort()) {
    const m = name.match(/^session-(\d+)\.json$/);
    if (!m) continue;
    const id = Number(m[1]);
    const metaPath = join(dir, `session-${id}-meta.json`);
    const callsPath = join(dir, `session-${id}-calls.jsonl`);
    const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
    let codeTokens = 0;
    const resultSeq = [];
    if (existsSync(callsPath)) {
      for (const line of readFileSync(callsPath, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const rec = JSON.parse(line);
        codeTokens += rec.code_tokens || 0;
        resultSeq.push(rec.result_tokens || 0);
      }
    }
    const observationTokens =
      arm === "clawql_known_op"
        ? cumulativeObservation(resultSeq)
        : resultSeq.reduce((a, b) => a + b, 0);
    const definitionTokens = meta.definitionTokens ?? 0;
    const weightedTokens = definitionTokens + observationTokens + CODE_WEIGHT * codeTokens;
    sessions.push({
      id,
      ok: meta.ok !== false,
      turns: meta.turns ?? (arm === "clawql_known_op" ? resultSeq.length : 1),
      observationTokens,
      codeTokens,
      definitionTokens,
      weightedTokens,
      whereMalformed: meta.whereMalformed ?? 0,
      failures: meta.failed || [],
    });
  }
  return sessions;
}

function aggregateSessions(sessions) {
  if (!sessions.length) return { skipped: true, note: "no sessions yet" };
  const weighted = sessions.map((s) => s.weightedTokens || 0).sort((a, b) => a - b);
  const obs = sessions.map((s) => s.observationTokens || 0).sort((a, b) => a - b);
  return {
    task_success_rate: sessions.filter((s) => s.ok).length / sessions.length,
    turns_mean: mean(sessions.map((s) => s.turns)),
    code_tokens_mean: mean(sessions.map((s) => s.codeTokens)),
    observation_tokens_mean: mean(obs),
    observation_tokens_median: medianSorted(obs),
    observation_tokens_over_ceiling: sessions.filter((s) => (s.observationTokens || 0) > TOKEN_CEILING)
      .length,
    observation_token_ceiling: TOKEN_CEILING,
    weighted_tokens_mean: mean(weighted),
    weighted_tokens_median: medianSorted(weighted),
    weighted_tokens_p90: percentileSorted(weighted, 90),
    sessions_failed: sessions.filter((s) => !s.ok).length,
    iters_completed: sessions.length,
  };
}

function winOnModel(program, known) {
  if (!program || program.skipped || !known || known.skipped) {
    return { win: false, reason: "missing arm aggregates" };
  }
  const checks = {
    weighted_median: program.weighted_tokens_median < known.weighted_tokens_median,
    weighted_p90: program.weighted_tokens_p90 < known.weighted_tokens_p90,
    task_success: program.task_success_rate >= known.task_success_rate,
    over_ceiling:
      program.observation_tokens_over_ceiling <= known.observation_tokens_over_ceiling,
    turns: program.turns_mean < known.turns_mean,
  };
  return {
    win: Object.values(checks).every(Boolean),
    checks,
  };
}

const summary = {
  measuredAt: new Date().toISOString(),
  kind: "fanout_real_model_validation",
  transport: "cursor_subscription_subagents",
  iters: precommit.iters_per_arm,
  models,
  arms,
  precommit,
  settings: {
    ordering: precommit.ordering,
    token_ceiling: TOKEN_CEILING,
    known_op_observation: "cumulative_re_reads",
    code_parity: "execute_args",
    comparison: "real_model_vs_real_model_only",
  },
  results: {},
  verdict: null,
};

for (const model of models) {
  summary.results[model.label] = { model: model.id, arms: {}, model_win: null };
  for (const arm of arms) {
    const sessions = loadArmSessions(model.label, arm);
    summary.results[model.label].arms[arm] = aggregateSessions(sessions);
  }
  const prog = summary.results[model.label].arms.clawql_program;
  const ko = summary.results[model.label].arms.clawql_known_op;
  summary.results[model.label].model_win = winOnModel(prog, ko);
}

const frontierWin = summary.results.frontier?.model_win?.win === true;
const smallWin = summary.results.small?.model_win?.win === true;
const dualEligible = precommit.dual_model_claim_eligible === true;
summary.verdict = {
  rules_id: precommit.verdict_rules?.id,
  dual_model_claim_eligible: dualEligible,
  frontier_win: frontierWin,
  small_win: smallWin,
  dual_model_claim:
    dualEligible && frontierWin && smallWin
      ? precommit.verdict_rules.dual_model_claim
      : null,
  claim: dualEligible && frontierWin && smallWin
    ? "program_beats_known_op_on_fanout_join_for_real_models"
    : frontierWin !== smallWin
      ? "single_model_only"
      : "no_dual_model_claim",
  detail: precommit.verdict_rules?.dual_model_claim,
};

mkdirSync(OUT_DIR, { recursive: true });
const outName =
  precommit.iters_per_arm >= 50
    ? "real-model-cursor-gate-frontier_small.json"
    : `real-model-cursor-pilot-n${precommit.iters_per_arm}.json`;
const outPath = join(OUT_DIR, outName);
writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n");
mkdirSync("/opt/cursor/artifacts", { recursive: true });
writeFileSync(join("/opt/cursor/artifacts", outName), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ wrote: outPath, verdict: summary.verdict }, null, 2));
