#!/usr/bin/env node
/**
 * Offline retrieval factorial for pageindex-ab (no LLM).
 *
 * Modes:
 *   --corpus contaminated-smoke   (default; NEVER cite for product decisions)
 *   --corpus freeze-candidate     (synthetic candidate; not spent freeze)
 *   --corpus hard-candidate       (RFCs + long synthetics; preferred)
 *
 * Confirmatory arms: 2×2×2 ranker × PageIndex(RRF) × CodeGraph.
 * Extra diagnostic arms (hard-candidate): union merge + heading-gated PI.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { retrieveForArm } from "./retrieval_helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/** Confirmatory 2×2×2 — PageIndex uses same-size RRF merge. */
const CONFIRMATORY_ARMS = [
  { id: "H-idf", ranker: "idf", pageindex: false, codegraph: false },
  { id: "H-idf-pi", ranker: "idf", pageindex: true, codegraph: false, piMerge: "rrf" },
  { id: "H-bm25", ranker: "bm25", pageindex: false, codegraph: false },
  { id: "H-bm25-pi", ranker: "bm25", pageindex: true, codegraph: false, piMerge: "rrf" },
  { id: "H-idf-cg", ranker: "idf", pageindex: false, codegraph: true },
  { id: "H-bm25-cg", ranker: "bm25", pageindex: false, codegraph: true },
  { id: "H-idf-pi-cg", ranker: "idf", pageindex: true, codegraph: true, piMerge: "rrf" },
  { id: "H-bm25-pi-cg", ranker: "bm25", pageindex: true, codegraph: true, piMerge: "rrf" },
];

/** Extra arms matching cheap-context product rule + heading gate. */
const EXTRA_ARMS = [
  {
    id: "H-idf-pi-union",
    ranker: "idf",
    pageindex: true,
    codegraph: false,
    piMerge: "union",
    role: "diagnostic",
  },
  {
    id: "H-idf-pi-gated",
    ranker: "idf",
    pageindex: true,
    codegraph: false,
    piMerge: "rrf",
    piGated: true,
    role: "diagnostic",
  },
];

function parseArgs(argv) {
  let corpus = "contaminated-smoke";
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--corpus" && argv[i + 1]) {
      corpus = argv[++i];
    }
  }
  return { corpus };
}

function resolveCorpus(corpus) {
  if (corpus === "contaminated-smoke") {
    const base = join(ROOT, "fixtures", "contaminated-smoke");
    return {
      tag: "contaminated-smoke",
      warning: "NEVER cite for product decisions",
      keysPath: join(base, "pilot-keys.jsonl"),
      docsDir: join(base, "docs"),
      codeDir: join(base, "code"),
      outDir: join(ROOT, "results", "contaminated-smoke"),
      includeExtra: false,
    };
  }
  if (corpus === "freeze-candidate") {
    const base = join(ROOT, "corpus", "freeze-candidate");
    return {
      tag: "pageindex-ab-v1-candidate",
      warning: "Synthetic freeze-candidate — not spent; do not flip defaults from this alone",
      keysPath: join(base, "keys.jsonl"),
      docsDir: join(base, "docs"),
      codeDir: join(base, "code"),
      outDir: join(ROOT, "results", "freeze-candidate"),
      includeExtra: false,
    };
  }
  if (corpus === "hard-candidate") {
    const base = join(ROOT, "corpus", "hard-candidate");
    return {
      tag: "pageindex-ab-v1-hard-candidate",
      warning: "Hard candidate (RFCs + long synthetics) — not spent; Harvey/ExtractBench excluded",
      keysPath: join(base, "keys.jsonl"),
      docsDir: join(base, "docs"),
      codeDir: join(base, "code"),
      outDir: join(ROOT, "results", "hard-candidate"),
      includeExtra: true,
    };
  }
  throw new Error(`unknown --corpus ${corpus}`);
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

function citationF1(cited, gold) {
  const c = new Set(cited);
  const g = new Set(gold);
  if (!c.size && !g.size) return 1;
  if (!c.size || !g.size) return 0;
  let tp = 0;
  for (const x of c) if (g.has(x)) tp++;
  const prec = tp / c.size;
  const rec = tp / g.size;
  return prec + rec === 0 ? 0 : (2 * prec * rec) / (prec + rec);
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
  const m = text.match(/\b\d+(\.\d+)?%?\b/);
  if (m && key.question_type === "exact_term") {
    return { answer: m[0], not_found: false };
  }
  return { answer: "", not_found: true };
}

async function main() {
  const { corpus } = parseArgs(process.argv);
  const cfg = resolveCorpus(corpus);
  if (!existsSync(cfg.keysPath)) {
    throw new Error(
      `keys missing: ${cfg.keysPath} (run build_freeze_candidate.py for freeze-candidate)`
    );
  }
  mkdirSync(cfg.outDir, { recursive: true });
  const keys = loadJsonl(cfg.keysPath);
  const ARMS = cfg.includeExtra
    ? [...CONFIRMATORY_ARMS, ...EXTRA_ARMS]
    : CONFIRMATORY_ARMS;
  const allAnswers = [];
  const perArm = {};

  for (const arm of ARMS) {
    perArm[arm.id] = [];
    for (const key of keys) {
      const top = await retrieveForArm(cfg, arm, key);
      const blob = top.map((t) => t.content).join("\n\n");
      const extracted = extractAnswer(blob, key);
      let answer = extracted.answer;
      let not_found = extracted.not_found;
      if (key.unanswerable) {
        const best = top[0]?.score ?? 0;
        not_found = best < 0.15;
        answer = not_found ? "" : answer || "guess";
        if (not_found) answer = "";
      }
      const row = {
        question_id: key.id,
        arm: arm.id,
        answer,
        sections: top.map((t) => t.id),
        not_found,
        retrieval_scores: top.map((t) => ({ id: t.id, score: t.score })),
      };
      perArm[arm.id].push(row);
      allAnswers.push(row);
    }
  }

  const summaries = {};
  const byStratum = {};
  for (const arm of ARMS) {
    const rows = perArm[arm.id];
    let strict = 0;
    let citeSum = 0;
    let n = 0;
    const stratumAcc = {};
    for (const row of rows) {
      const key = keys.find((k) => k.id === row.question_id);
      n++;
      const cite = citationF1(row.sections, key.gold_sections || []);
      citeSum += cite;
      let ok = false;
      if (key.unanswerable) {
        ok = !!row.not_found;
      } else {
        const variants = [key.normalized_answer, ...(key.accepted_variants || [])].map(normalize);
        const ans = normalize(row.answer);
        const textOk = variants.some((v) => v && (ans === v || ans.includes(v) || v.includes(ans)));
        const citeOk = !key.gold_sections?.length || cite > 0;
        ok = textOk && citeOk;
      }
      if (ok) strict++;
      const st = key.stratum || "unknown";
      if (!stratumAcc[st]) stratumAcc[st] = { n: 0, strict: 0 };
      stratumAcc[st].n++;
      if (ok) stratumAcc[st].strict++;
    }
    summaries[arm.id] = {
      n,
      strict_accuracy: strict / n,
      mean_citation_f1: citeSum / n,
    };
    byStratum[arm.id] = Object.fromEntries(
      Object.entries(stratumAcc).map(([k, v]) => [k, { n: v.n, strict_accuracy: v.strict / v.n }])
    );
  }

  const piOn = ["H-idf-pi", "H-bm25-pi", "H-idf-pi-cg", "H-bm25-pi-cg"];
  const piOff = ["H-idf", "H-bm25", "H-idf-cg", "H-bm25-cg"];
  const bm25 = ["H-bm25", "H-bm25-pi", "H-bm25-cg", "H-bm25-pi-cg"];
  const idf = ["H-idf", "H-idf-pi", "H-idf-cg", "H-idf-pi-cg"];
  const cgOn = ["H-idf-cg", "H-bm25-cg", "H-idf-pi-cg", "H-bm25-pi-cg"];
  const cgOff = ["H-idf", "H-bm25", "H-idf-pi", "H-bm25-pi"];
  const mean = (ids) => ids.reduce((s, id) => s + summaries[id].strict_accuracy, 0) / ids.length;

  const report = {
    tag: cfg.tag,
    warning: cfg.warning,
    n_questions: keys.length,
    summaries,
    by_stratum: byStratum,
    contrasts: {
      pageindex_main_effect: mean(piOn) - mean(piOff),
      bm25_main_effect: mean(bm25) - mean(idf),
      codegraph_main_effect: mean(cgOn) - mean(cgOff),
      combination_vs_today:
        summaries["H-bm25-pi-cg"].strict_accuracy - summaries["H-idf"].strict_accuracy,
      // Diagnostic (not confirmatory Holms): union / gated vs today
      ...(summaries["H-idf-pi-union"]
        ? {
            union_vs_today:
              summaries["H-idf-pi-union"].strict_accuracy - summaries["H-idf"].strict_accuracy,
            gated_vs_today:
              summaries["H-idf-pi-gated"].strict_accuracy - summaries["H-idf"].strict_accuracy,
            union_vs_rrf_pi:
              summaries["H-idf-pi-union"].strict_accuracy - summaries["H-idf-pi"].strict_accuracy,
          }
        : {}),
    },
  };

  writeFileSync(
    join(cfg.outDir, "pilot-answers.jsonl"),
    allAnswers.map((r) => JSON.stringify(r)).join("\n") + "\n"
  );
  writeFileSync(join(cfg.outDir, "pilot-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
