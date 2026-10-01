#!/usr/bin/env node
/**
 * Size a dedicated OpenRouter eval key for Track B.
 *
 * Prefer rows with OpenRouter `usage` (post-fix). Fallback: reconstruct from
 * answer char lengths for A-no-tools cells (chars/4), which undercounts multi-turn.
 *
 *   node …/estimate_track_b_eval_key_limit.mjs [answers.jsonl]
 *
 * Prints recommended key spending limit ≈ mean_cost_per_cell × 54 × 1.5
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TOTAL_CELLS = 54;
const SAFETY = 1.5;
// anthropic/claude-sonnet-4.6 OpenRouter public pricing (USD / token)
const PROMPT = 3e-6;
const COMPLETION = 15e-6;

function loadJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => !r.error);
}

function costFromUsage(u) {
  if (!u) return null;
  const pt = Number(u.prompt_tokens || 0);
  const ct = Number(u.completion_tokens || 0);
  if (!pt && !ct) return null;
  return pt * PROMPT + ct * COMPLETION;
}

function costFromAnswerChars(answer) {
  const ct = Math.max(1, Math.ceil(String(answer || "").length / 4));
  // prompt tiny for no-tools; ignore — lower bound
  return ct * COMPLETION;
}

function main() {
  const answersPath =
    process.argv[2] || path.join(ROOT, "results", "agent-loop-freeze", "answers.jsonl");
  const rows = loadJsonl(answersPath);
  const withUsage = rows
    .map((r) => ({ r, cost: costFromUsage(r.usage) }))
    .filter((x) => x.cost != null);
  const source =
    withUsage.length > 0
      ? { label: "openrouter_usage", sample: withUsage }
      : {
          label: "answer_chars_lower_bound",
          sample: rows.map((r) => ({ r, cost: costFromAnswerChars(r.answer) })),
        };

  const costs = source.sample.map((x) => x.cost);
  const n = costs.length;
  if (!n) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: "no graded rows to estimate from",
          answers_path: answersPath,
        },
        null,
        2
      )
    );
    process.exitCode = 2;
    return;
  }
  const sum = costs.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const recommended = mean * TOTAL_CELLS * SAFETY;
  const out = {
    ok: true,
    answers_path: answersPath,
    source: source.label,
    graded_cells: n,
    mean_usd_per_cell: Number(mean.toFixed(4)),
    sum_usd_observed: Number(sum.toFixed(4)),
    total_cells: TOTAL_CELLS,
    safety_multiplier: SAFETY,
    recommended_key_limit_usd: Number(recommended.toFixed(2)),
    note:
      source.label === "answer_chars_lower_bound"
        ? "No usage fields yet — estimate is a lower bound from completion chars only. Re-run after a few tool-arm cells with usage logging, then raise the key limit if needed."
        : "Set OpenRouter key spending limit to recommended_key_limit_usd on a Track-B-only key; store as GitHub secret OPENROUTER_API_KEY_TRACK_B.",
    per_cell: source.sample.map(({ r, cost }) => ({
      arm: r.arm,
      question_id: r.question_id,
      usd: Number(cost.toFixed(4)),
      usage: r.usage || null,
    })),
  };
  console.log(JSON.stringify(out, null, 2));
}

main();
