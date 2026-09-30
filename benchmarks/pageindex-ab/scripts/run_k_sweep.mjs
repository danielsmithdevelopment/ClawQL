#!/usr/bin/env node
/**
 * Track C — k-sweep for default top-k (H-idf vault sections).
 *
 * Metrics per k ∈ {3,6,10,20}:
 *   - gold_recall: gold section id in top-k
 *   - answer_accuracy: offline extractAnswer finds answer in top-k text
 *   - leakage: answer_ok && !gold_in_top (fact appears in a non-gold section)
 *
 * Arms:
 *   - H-idf@k  — retrieve top-k sections, grade
 *   - H-none   — no-retrieval (empty evidence). Offline extractAnswer → ~0 on
 *                answerable keys. With OPENROUTER_API_KEY, also runs flash-lite
 *                finalize on empty evidence (true memory / training baseline).
 *
 * Usage:
 *   node benchmarks/pageindex-ab/scripts/run_k_sweep.mjs
 *   node benchmarks/pageindex-ab/scripts/run_k_sweep.mjs --ks 3,6,10,20 --llm-none
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { rankSectionsVault, rankCodeFiles } from "./retrieval_helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DEFAULT_KS = [3, 6, 10, 20];

function parseArgs(argv) {
  const out = {
    ks: DEFAULT_KS,
    llmNone: false,
    outDir: join(ROOT, "design"),
    corpus: join(ROOT, "corpus", "hard-candidate"),
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ks" && argv[i + 1]) {
      out.ks = argv[++i].split(",").map((x) => Number(x.trim())).filter((n) => n > 0);
    } else if (a === "--llm-none") out.llmNone = true;
    else if (a === "--out" && argv[i + 1]) out.outDir = argv[++i];
  }
  return out;
}

function loadJsonl(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function normalize(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s.\-/%]/g, "")
    .replace(/\s+/g, " ");
}

function extractAnswer(text, key) {
  if (key.unanswerable) return { answer: "", not_found: true };
  const variants = [key.normalized_answer, ...(key.accepted_variants || [])].filter(Boolean);
  const lower = text.toLowerCase();
  for (const v of variants) {
    if (v && lower.includes(v.toLowerCase())) {
      return { answer: key.normalized_answer, not_found: false };
    }
  }
  return { answer: "", not_found: true };
}

function gradeAnswer(extracted, key) {
  if (key.unanswerable) return !!extracted.not_found;
  const ans = normalize(extracted.answer);
  // Empty answer must not match via String.includes("") (every string contains "").
  if (!ans) return false;
  const variants = [key.normalized_answer, ...(key.accepted_variants || [])].map(normalize);
  return variants.some((v) => v && (ans === v || ans.includes(v) || v.includes(ans)));
}

function rankedForKey(corpus, key) {
  if (key.stratum === "code") {
    return rankCodeFiles(join(corpus, "code"), key.document_id, key.question, "idf");
  }
  const path = join(corpus, "docs", `${key.document_id}.md`);
  if (!existsSync(path)) return [];
  const md = readFileSync(path, "utf8");
  return rankSectionsVault(md, key.question, "idf");
}

function llmFinalizeEmpty(question, questionType, model) {
  const py = `
import json, os, sys
sys.path.insert(0, ${JSON.stringify(join(ROOT, "scripts"))})
from fair_test_common import finalize_answer
q = json.loads(sys.argv[1])
r = finalize_answer(question=q["question"], evidence="", model=q["model"], question_type=q.get("question_type"))
print(json.dumps({"answer": r.get("answer",""), "not_found": bool(r.get("not_found"))}))
`;
  const payload = JSON.stringify({
    question,
    question_type: questionType,
    model,
  });
  const res = spawnSync("python3", ["-c", py, payload], {
    encoding: "utf8",
    env: process.env,
    timeout: 60_000,
  });
  if (res.status !== 0) {
    return { answer: "", not_found: true, error: (res.stderr || "").slice(0, 200) };
  }
  try {
    return JSON.parse(res.stdout.trim().split("\n").pop());
  } catch {
    return { answer: "", not_found: true, error: "parse" };
  }
}

function main() {
  const args = parseArgs(process.argv);
  const keysPath = join(args.corpus, "keys.jsonl");
  const keys = loadJsonl(keysPath);
  const hasOr = Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
  const runLlmNone = args.llmNone && hasOr;
  const model =
    process.env.PAGEINDEX_AB_MODEL ||
    process.env.PAGEINDEX_AB_AGENT_MODEL ||
    "google/gemini-2.5-flash-lite";

  const perK = {};
  for (const k of args.ks) {
    perK[k] = {
      n: 0,
      gold_hit: 0,
      answer_ok: 0,
      strict_ok: 0, // answer_ok && (no gold | gold in top-k) — matches pilot strict
      leakage: 0, // answer_ok && !gold_hit
      gold_and_answer: 0,
      unanswerable_ok: 0,
      unanswerable_n: 0,
      by_stratum: {},
    };
  }

  const none = {
    n: 0,
    answer_ok: 0,
    unanswerable_ok: 0,
    unanswerable_n: 0,
    mode: runLlmNone ? "llm_finalize_empty" : "offline_extract_empty",
    model: runLlmNone ? model : null,
    note: runLlmNone
      ? "LLM finalize with empty evidence (training/memory baseline)"
      : "Offline extractAnswer on empty evidence (always miss answerable keys). Set OPENROUTER_API_KEY + --llm-none for true memory baseline.",
  };

  // Only grade keys we can retrieve for (docs present or code)
  for (const key of keys) {
    const ranked = rankedForKey(args.corpus, key);
    const gold = new Set(key.gold_sections || []);
    const stratum = key.stratum || "unknown";

    for (const k of args.ks) {
      const top = ranked.slice(0, k);
      const blob = top.map((t) => t.content || "").join("\n\n");
      const goldHit = gold.size === 0 ? null : [...gold].some((g) => top.some((t) => t.id === g));
      const extracted = extractAnswer(blob, key);
      let ok = gradeAnswer(extracted, key);
      // Match pilot: for answerable keys with gold, require citeOk for "strict" — but for
      // k-sweep we report answer_accuracy separately from gold_recall (user cares about both).
      const st = perK[k];
      st.n++;
      if (!st.by_stratum[stratum]) {
        st.by_stratum[stratum] = {
          n: 0,
          gold_hit: 0,
          answer_ok: 0,
          strict_ok: 0,
          leakage: 0,
        };
      }
      st.by_stratum[stratum].n++;

      if (key.unanswerable) {
        st.unanswerable_n++;
        if (ok) {
          st.unanswerable_ok++;
          st.answer_ok++;
          st.strict_ok++;
          st.by_stratum[stratum].answer_ok++;
          st.by_stratum[stratum].strict_ok++;
        }
        continue;
      }

      if (gold.size && goldHit) {
        st.gold_hit++;
        st.by_stratum[stratum].gold_hit++;
      }
      if (ok) {
        st.answer_ok++;
        st.by_stratum[stratum].answer_ok++;
        const citeOk = !gold.size || goldHit === true;
        if (citeOk) {
          st.strict_ok++;
          st.by_stratum[stratum].strict_ok++;
        }
        if (gold.size && goldHit) st.gold_and_answer++;
        if (gold.size && goldHit === false) {
          st.leakage++;
          st.by_stratum[stratum].leakage++;
        }
      }
    }

    // No-retrieval arm
    none.n++;
    let noneOk = false;
    if (runLlmNone) {
      const fin = llmFinalizeEmpty(key.question, key.question_type, model);
      noneOk = gradeAnswer(fin, key);
    } else {
      noneOk = gradeAnswer(extractAnswer("", key), key);
    }
    if (key.unanswerable) {
      none.unanswerable_n++;
      if (noneOk) none.unanswerable_ok++;
    }
    if (noneOk) none.answer_ok++;
  }

  const summarize = (st) => {
    const answerable = st.n - st.unanswerable_n;
    const goldN = answerable; // gold_hit only counted on answerable with gold; use keys with gold
    return {
      n: st.n,
      answer_accuracy: st.n ? st.answer_ok / st.n : 0,
      strict_accuracy: st.n ? st.strict_ok / st.n : 0,
      gold_recall: null, // filled with denom below
      leakage_rate_of_answers: st.answer_ok ? st.leakage / st.answer_ok : 0,
      gold_and_answer: st.gold_and_answer,
      leakage: st.leakage,
      unanswerable_accuracy:
        st.unanswerable_n ? st.unanswerable_ok / st.unanswerable_n : null,
      by_stratum: Object.fromEntries(
        Object.entries(st.by_stratum).map(([s, v]) => [
          s,
          {
            n: v.n,
            answer_accuracy: v.n ? v.answer_ok / v.n : 0,
            strict_accuracy: v.n ? v.strict_ok / v.n : 0,
            gold_hit: v.gold_hit,
            leakage: v.leakage,
          },
        ]),
      ),
    };
  };

  // Gold recall denominator: keys with non-empty gold among answerable
  const goldDenom = keys.filter((k) => !k.unanswerable && (k.gold_sections || []).length).length;

  const byK = {};
  for (const k of args.ks) {
    const st = perK[k];
    const base = summarize(st);
    byK[k] = {
      ...base,
      gold_recall: goldDenom ? st.gold_hit / goldDenom : null,
      gold_recall_n: goldDenom,
      gold_hit: st.gold_hit,
      delta_answer_vs_k3: null,
      delta_strict_vs_k3: null,
      delta_gold_vs_k3: null,
    };
  }
  const k3 = byK[3];
  if (k3) {
    for (const k of args.ks) {
      byK[k].delta_answer_vs_k3 = byK[k].answer_accuracy - k3.answer_accuracy;
      byK[k].delta_strict_vs_k3 = byK[k].strict_accuracy - k3.strict_accuracy;
      byK[k].delta_gold_vs_k3 =
        byK[k].gold_recall != null && k3.gold_recall != null
          ? byK[k].gold_recall - k3.gold_recall
          : null;
    }
  }

  none.answer_accuracy = none.n ? none.answer_ok / none.n : 0;
  // Offline empty extract: only unanswerable keys can score (not_found).
  none.answerable_accuracy =
    none.n > none.unanswerable_n
      ? (none.answer_ok - none.unanswerable_ok) / (none.n - none.unanswerable_n)
      : null;

  // Recommend on strict_accuracy (pilot-compatible); fall back to answer_accuracy.
  const gains = args.ks.map((k) => ({
    k,
    gain: byK[k].delta_strict_vs_k3 ?? 0,
    answer_gain: byK[k].delta_answer_vs_k3 ?? 0,
    gold_gain: byK[k].delta_gold_vs_k3 ?? 0,
  }));
  const maxGain = Math.max(...gains.map((g) => g.gain));
  const stillClimbingAt20 =
    byK[20] && byK[10]
      ? byK[20].gold_recall - byK[10].gold_recall > 0.05
      : false;
  let recommend = args.ks[args.ks.length - 1];
  for (const g of gains) {
    if (g.gain >= maxGain - 0.02) {
      recommend = g.k;
      break;
    }
  }
  // Only recommend raise if gain ≥ ~detectable (~0.07 on n=358)
  const raiseDefault = maxGain >= 0.07;

  const report = {
    tag: "pageindex-ab-k-sweep-v1",
    generated_at: new Date().toISOString(),
    arm: "H-idf",
    ks: args.ks,
    n_questions: keys.length,
    n_with_gold: goldDenom,
    detectable_pp_note:
      "With n=358, offline single-comparison differences of ~7–8pp are decisive (deterministic extractAnswer).",
    by_k: byK,
    no_retrieval: none,
    leakage_explanation:
      "When answer_accuracy > gold_recall / strict_accuracy, the gap is answers found in non-gold top-k sections (offline extract), not LLM memory. True training-memory needs --llm-none + OPENROUTER_API_KEY on H-none.",
    gold_curve_note: stillClimbingAt20
      ? "Gold recall still climbing through k=20 (>+5pp vs k=10); ceiling not reached — consider k=40 in a follow-up if product context budget allows."
      : "Gold recall gain from k=10→20 is small; near plateau for retrieval depth.",
    recommendation: {
      current_eval_top_k: 3,
      suggested_eval_top_k: raiseDefault ? recommend : 3,
      raise_default: raiseDefault,
      metric: "strict_accuracy",
      max_strict_gain_vs_k3: maxGain,
      max_answer_gain_vs_k3: Math.max(...gains.map((g) => g.answer_gain)),
      max_gold_gain_vs_k3: Math.max(...gains.map((g) => g.gold_gain)),
      rationale: raiseDefault
        ? `Strict accuracy rises ${(maxGain * 100).toFixed(1)}pp from k=3 to k=${gains.find((g) => g.gain === maxGain)?.k}; recommend raising eval/default section top-k to ${recommend}.`
        : "Strict gains below ~7pp detection threshold; keep k=3 until LLM-graded sweep confirms.",
    },
    track_b:
      "CodeGraph prove keys signed; additive A-codegraph locked — settle before 2026-10-15 freeze.",
  };

  mkdirSync(args.outDir, { recursive: true });
  const outPath = join(args.outDir, "k-sweep-hidf.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  console.error(JSON.stringify({ ok: true, wrote: outPath }, null, 2));
}

main();
