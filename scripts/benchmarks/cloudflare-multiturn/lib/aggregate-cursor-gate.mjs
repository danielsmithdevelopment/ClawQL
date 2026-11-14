#!/usr/bin/env node
/**
 * Aggregate Cursor-gate sessions into real-model summary + SPEC verdict.
 *
 *   node lib/aggregate-cursor-gate.mjs --state /tmp/cf-mt-real-gate
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeVerdict, GATE_VERDICT_RULES } from "../run-real-model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../..");
const OUT_DIR = join(ROOT, "docs/benchmarks/cloudflare-multiturn");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const STATE = arg("--state", "/tmp/cf-mt-real-gate");
const TOKEN_CEILING = Math.max(
  1000,
  Number(process.env.CF_MT_REAL_TOKEN_CEILING || 10_000) || 10_000
);

const precommit = JSON.parse(readFileSync(join(STATE, "precommit.json"), "utf8"));
const models = precommit.models;
const arms = precommit.arms;

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
    let observationTokens = 0;
    let whereMalformed = meta.whereMalformed ?? 0;
    if (existsSync(callsPath)) {
      for (const line of readFileSync(callsPath, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const rec = JSON.parse(line);
        codeTokens += rec.code_tokens || 0;
        observationTokens += rec.result_tokens || 0;
      }
    }
    const definitionTokens = meta.definitionTokens ?? 0;
    const weightedTokens = definitionTokens + observationTokens + 5 * codeTokens;
    sessions.push({
      id,
      ok: meta.ok !== false,
      turns: meta.turns ?? 0,
      retries: meta.retries ?? 0,
      toolCalls: meta.toolCalls ?? 0,
      inputTokens: meta.inputTokens ?? 0,
      outputTokens: meta.outputTokens ?? 0,
      observationTokens,
      codeTokens,
      definitionTokens,
      weightedTokens,
      whereAttempts: meta.whereAttempts ?? 0,
      whereMalformed,
      observationBudgetHits: meta.observationBudgetHits ?? 0,
      session_ms: meta.session_ms ?? 0,
      failures: meta.failed || [],
    });
  }
  return sessions;
}

function aggregateSessions(sessions) {
  if (!sessions.length) {
    return { skipped: true, note: "no sessions yet" };
  }
  const obs = sessions.map((s) => s.observationTokens || 0).sort((a, b) => a - b);
  const weighted = sessions.map((s) => s.weightedTokens || 0).sort((a, b) => a - b);
  const code = sessions.map((s) => s.codeTokens || 0).sort((a, b) => a - b);
  return {
    task_success_rate: sessions.filter((s) => s.ok).length / sessions.length,
    turns_mean: mean(sessions.map((s) => s.turns)),
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
    sessions_failed: sessions.filter((s) => !s.ok).length,
    iters_completed: sessions.length,
  };
}

const summary = {
  measuredAt: new Date().toISOString(),
  kind: "real_model_validation",
  transport: "cursor_subscription_subagents",
  iters: precommit.iters_per_arm,
  models,
  arms,
  precommit,
  settings: {
    ordering: precommit.ordering,
    token_ceiling: TOKEN_CEILING,
    comparison: "real_model_vs_real_model_only",
  },
  results: {},
  verdict: null,
};

for (const model of models) {
  summary.results[model.label] = { model: model.id, arms: {} };
  for (const arm of arms) {
    const sessions = loadArmSessions(model.label, arm);
    summary.results[model.label].arms[arm] = aggregateSessions(sessions);
  }
  // Hosted CF explicitly noted as out
  summary.results[model.label].arms.cloudflare_codemode = {
    skipped: true,
    note:
      "Out of real-model gate: hosted Cloudflare code-mode would hit the live API " +
      "(step 12 could write). Explicit exclusion, not a silent drop.",
  };
}

summary.verdict = computeVerdict(summary);

const stamp = models.map((m) => m.label).join("_");
const out = join(OUT_DIR, `real-model-cursor-gate-${stamp}.json`);
writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");
mkdirSync("/opt/cursor/artifacts", { recursive: true });
writeFileSync(
  "/opt/cursor/artifacts/cf-mt-real-model-cursor-gate.json",
  JSON.stringify(summary, null, 2) + "\n"
);

const complete = models.every((m) =>
  arms.every((a) => {
    const block = summary.results[m.label].arms[a];
    return block && !block.skipped && block.iters_completed >= precommit.iters_per_arm;
  })
);

console.log(
  JSON.stringify(
    {
      wrote: out,
      complete,
      iters_target: precommit.iters_per_arm,
      verdict: summary.verdict,
      progress: Object.fromEntries(
        models.map((m) => [
          m.label,
          Object.fromEntries(
            arms.map((a) => [
              a,
              summary.results[m.label].arms[a].iters_completed ??
                summary.results[m.label].arms[a].note,
            ])
          ),
        ])
      ),
      rules_id: GATE_VERDICT_RULES.id,
      models_pin_revision: GATE_VERDICT_RULES.models_pin_revision,
    },
    null,
    2
  )
);
process.exit(complete && summary.verdict ? 0 : 3);
