#!/usr/bin/env node
/**
 * Cheap agent-lite factorial for pageindex-ab via OpenRouter.
 *
 * Cost posture (default):
 *   - Model: google/gemini-2.5-flash-lite (override with PAGEINDEX_AB_MODEL)
 *   - Stratified sample: PAGEINDEX_AB_LIMIT (default 24; 0 = full corpus)
 *   - Mode: retrieval → single LLM completion (not full OpenCode tool loops)
 *   - Trials: PAGEINDEX_AB_TRIALS (default 1)
 *   - Extra arms (union + heading-gated PI): PAGEINDEX_AB_EXTRA_ARMS=1
 *     (auto-on for hard-candidate)
 *
 * Full OpenCode × clawql-inference matrix remains a follow-up (PAGEINDEX_AB_MODE=opencode).
 *
 * Exit codes: 0 ok · 2 missing key/keys · 3 OpenRouter/API failure · 4 unsupported mode
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { retrieveForArm } from "./retrieval_helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "results", "agent-factorial");

const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";
const DEFAULT_LIMIT = 24;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

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

function envInt(name, fallback, { allowZero = false } = {}) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (allowZero && n === 0) return 0;
  return n > 0 ? Math.floor(n) : fallback;
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

/** Stratified sample: round-robin across strata until limit. */
function sampleKeys(keys, limit) {
  if (limit <= 0 || keys.length <= limit) return keys;
  const buckets = new Map();
  for (const k of keys) {
    const st = k.stratum || "unknown";
    if (!buckets.has(st)) buckets.set(st, []);
    buckets.get(st).push(k);
  }
  const strata = [...buckets.keys()];
  const out = [];
  let i = 0;
  while (out.length < limit) {
    let added = false;
    for (const st of strata) {
      const b = buckets.get(st);
      if (i < b.length) {
        out.push(b[i]);
        added = true;
        if (out.length >= limit) break;
      }
    }
    if (!added) break;
    i++;
  }
  return out;
}

function resolveCorpus(corpus) {
  if (corpus === "contaminated-smoke") {
    return {
      tag: "contaminated-smoke",
      warning: "NEVER cite for product decisions",
      keysPath: join(ROOT, "fixtures", "contaminated-smoke", "pilot-keys.jsonl"),
      docsDir: join(ROOT, "fixtures", "contaminated-smoke", "docs"),
      codeDir: join(ROOT, "fixtures", "contaminated-smoke", "code"),
      includeExtraDefault: false,
    };
  }
  if (corpus === "hard-candidate") {
    return {
      tag: "pageindex-ab-v1-hard-candidate",
      warning: "Hard candidate (RFCs + long synthetics) — not spent",
      keysPath: join(ROOT, "corpus", "hard-candidate", "keys.jsonl"),
      docsDir: join(ROOT, "corpus", "hard-candidate", "docs"),
      codeDir: join(ROOT, "corpus", "hard-candidate", "code"),
      includeExtraDefault: true,
    };
  }
  return {
    tag: "pageindex-ab-v1-candidate",
    warning: "Synthetic freeze-candidate — not spent",
    keysPath: join(ROOT, "corpus", "freeze-candidate", "keys.jsonl"),
    docsDir: join(ROOT, "corpus", "freeze-candidate", "docs"),
    codeDir: join(ROOT, "corpus", "freeze-candidate", "code"),
    includeExtraDefault: false,
  };
}

function buildPrompt(key, top) {
  const ctx = top
    .map((t, i) => `### [${i + 1}] section_id=${t.id}\n${t.content.slice(0, 1800)}`)
    .join("\n\n");
  return [
    "You answer questions from retrieved document sections only.",
    "Return a single JSON object with keys: answer (string), sections (array of section_id strings you used), not_found (boolean).",
    'If the answer is not in the context, set not_found=true and answer="".',
    "Do not invent facts. No markdown fences.",
    "",
    `Question: ${key.question}`,
    "",
    "Retrieved context:",
    ctx || "(empty)",
  ].join("\n");
}

function parseModelJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function openRouterChat({ apiKey, model, prompt }) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.CLAWQL_OPENROUTER_HTTP_REFERER || "https://clawql.com",
      "X-Title": process.env.CLAWQL_OPENROUTER_APP_TITLE || "ClawQL pageindex-ab",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 256,
      messages: [
        { role: "system", content: "Return only valid JSON for the answer contract." },
        { role: "user", content: prompt },
      ],
    }),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`OpenRouter non-JSON ${res.status}: ${text.slice(0, 400)}`);
  }
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  const content = data.choices?.[0]?.message?.content ?? "";
  const usage = data.usage || {};
  return { content, usage, raw: data };
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function gradeRow(key, row) {
  const cite = citationF1(row.sections || [], key.gold_sections || []);
  if (key.unanswerable) {
    return { ok: !!row.not_found, cite };
  }
  const variants = [key.normalized_answer, ...(key.accepted_variants || [])].map(normalize);
  const ans = normalize(row.answer);
  const textOk = variants.some((v) => v && (ans === v || ans.includes(v) || v.includes(ans)));
  const citeOk = !key.gold_sections?.length || cite > 0;
  return { ok: textOk && citeOk, cite };
}

async function runAgentLite({ apiKey, model, cfg, keys, trials, concurrency, arms }) {
  const cells = [];
  for (const arm of arms) {
    for (const key of keys) {
      for (let trial = 1; trial <= trials; trial++) {
        cells.push({ arm, key, trial });
      }
    }
  }

  let promptTokens = 0;
  let completionTokens = 0;
  const answers = [];

  await mapPool(cells, concurrency, async (cell) => {
    const top = await retrieveForArm(cfg, cell.arm, cell.key);
    const prompt = buildPrompt(cell.key, top);
    const { content, usage } = await openRouterChat({ apiKey, model, prompt });
    promptTokens += usage.prompt_tokens || 0;
    completionTokens += usage.completion_tokens || 0;
    const parsed = parseModelJson(content) || {};
    const sections =
      Array.isArray(parsed.sections) && parsed.sections.length
        ? parsed.sections.map(String)
        : top.map((t) => t.id);
    const row = {
      question_id: cell.key.id,
      arm: cell.arm.id,
      trial: cell.trial,
      answer: parsed.answer ?? "",
      sections,
      not_found: Boolean(parsed.not_found),
      model,
      mode: "agent-lite",
      retrieval_ids: top.map((t) => t.id),
    };
    answers.push(row);
    process.stderr.write(".");
  });
  process.stderr.write("\n");

  // Aggregate trials by majority for grading (trial=1 → identity)
  const summaries = {};
  for (const arm of arms) {
    let strict = 0;
    let citeSum = 0;
    let n = 0;
    for (const key of keys) {
      const trialsRows = answers.filter((a) => a.arm === arm.id && a.question_id === key.id);
      // majority vote on strict ok
      let votes = 0;
      let citeAcc = 0;
      for (const row of trialsRows) {
        const g = gradeRow(key, row);
        if (g.ok) votes++;
        citeAcc += g.cite;
      }
      const ok = votes > trialsRows.length / 2;
      n++;
      if (ok) strict++;
      citeSum += citeAcc / Math.max(1, trialsRows.length);
    }
    summaries[arm.id] = {
      n,
      strict_accuracy: strict / n,
      mean_citation_f1: citeSum / n,
    };
  }

  const piOn = ["H-idf-pi", "H-bm25-pi", "H-idf-pi-cg", "H-bm25-pi-cg"];
  const piOff = ["H-idf", "H-bm25", "H-idf-cg", "H-bm25-cg"];
  const bm25 = ["H-bm25", "H-bm25-pi", "H-bm25-cg", "H-bm25-pi-cg"];
  const idf = ["H-idf", "H-idf-pi", "H-idf-cg", "H-idf-pi-cg"];
  const cgOn = ["H-idf-cg", "H-bm25-cg", "H-idf-pi-cg", "H-bm25-pi-cg"];
  const cgOff = ["H-idf", "H-bm25", "H-idf-pi", "H-bm25-pi"];
  const mean = (ids) => ids.reduce((s, id) => s + summaries[id].strict_accuracy, 0) / ids.length;

  const contrasts = {
    pageindex_main_effect: mean(piOn) - mean(piOff),
    bm25_main_effect: mean(bm25) - mean(idf),
    codegraph_main_effect: mean(cgOn) - mean(cgOff),
    combination_vs_today:
      summaries["H-bm25-pi-cg"].strict_accuracy - summaries["H-idf"].strict_accuracy,
  };
  if (summaries["H-idf-pi-union"]) {
    contrasts.union_vs_today =
      summaries["H-idf-pi-union"].strict_accuracy - summaries["H-idf"].strict_accuracy;
    contrasts.gated_vs_today =
      summaries["H-idf-pi-gated"].strict_accuracy - summaries["H-idf"].strict_accuracy;
    contrasts.union_vs_rrf_pi =
      summaries["H-idf-pi-union"].strict_accuracy - summaries["H-idf-pi"].strict_accuracy;
  }

  return {
    answers,
    summaries,
    contrasts,
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  const corpus = process.env.PAGEINDEX_AB_CORPUS || "freeze-candidate";
  const mode = (process.env.PAGEINDEX_AB_MODE || "agent-lite").toLowerCase();
  const model = process.env.PAGEINDEX_AB_MODEL || DEFAULT_MODEL;
  const limit = envInt("PAGEINDEX_AB_LIMIT", DEFAULT_LIMIT, { allowZero: true });
  const trials = envInt("PAGEINDEX_AB_TRIALS", envInt("OPENBENCH_TRIALS", 1));
  const concurrency = envInt("PAGEINDEX_AB_CONCURRENCY", 4);
  const cfg = resolveCorpus(corpus);

  if (!apiKey) {
    const report = {
      ok: false,
      mode,
      blockers: [{ code: "missing_openrouter", message: "OPENROUTER_API_KEY is not set" }],
    };
    writeFileSync(join(OUT, "agent-blocker-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }
  if (!existsSync(cfg.keysPath)) {
    const report = {
      ok: false,
      mode,
      blockers: [{ code: "missing_keys", message: `keys not found at ${cfg.keysPath}` }],
    };
    writeFileSync(join(OUT, "agent-blocker-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }
  if (mode === "opencode") {
    const report = {
      ok: false,
      mode,
      blockers: [
        {
          code: "opencode_not_wired",
          message:
            "Full OpenCode matrix not enabled in this cheap path. Use PAGEINDEX_AB_MODE=agent-lite.",
        },
      ],
    };
    writeFileSync(join(OUT, "agent-blocker-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(4);
  }

  const allKeys = loadJsonl(cfg.keysPath);
  const keys = sampleKeys(allKeys, limit);
  const extraEnv = (process.env.PAGEINDEX_AB_EXTRA_ARMS || "").trim();
  const includeExtra =
    extraEnv === "1" ||
    extraEnv.toLowerCase() === "true" ||
    (extraEnv === "" && Boolean(cfg.includeExtraDefault));
  const arms = includeExtra ? [...CONFIRMATORY_ARMS, ...EXTRA_ARMS] : CONFIRMATORY_ARMS;
  const nCells = keys.length * arms.length * trials;

  console.error(
    JSON.stringify({
      starting: true,
      mode: "agent-lite",
      model,
      corpus: cfg.tag,
      n_questions: keys.length,
      n_arms: arms.length,
      arm_ids: arms.map((a) => a.id),
      trials,
      n_cells: nCells,
      concurrency,
      include_extra_arms: includeExtra,
      cost_note:
        "flash-lite + single completion per cell; PAGEINDEX_AB_LIMIT=0 runs full corpus",
    })
  );

  let result;
  try {
    result = await runAgentLite({ apiKey, model, cfg, keys, trials, concurrency, arms });
  } catch (err) {
    const report = {
      ok: false,
      mode: "agent-lite",
      model,
      error: String(err?.message || err),
    };
    writeFileSync(join(OUT, "agent-error.json"), JSON.stringify(report, null, 2));
    console.error(err);
    process.exit(3);
  }

  const report = {
    ok: true,
    tag: cfg.tag,
    warning: cfg.warning,
    mode: "agent-lite",
    model,
    n_questions: keys.length,
    n_questions_full_corpus: allKeys.length,
    trials,
    question_ids: keys.map((k) => k.id),
    summaries: result.summaries,
    contrasts: result.contrasts,
    usage: result.usage,
    // rough public flash-lite list prices (USD / 1M); report only
    cost_estimate_usd: {
      note: "approximate; OpenRouter list prices vary",
      input_per_mtok: 0.1,
      output_per_mtok: 0.4,
      estimated:
        (result.usage.prompt_tokens / 1e6) * 0.1 + (result.usage.completion_tokens / 1e6) * 0.4,
    },
  };

  writeFileSync(
    join(OUT, "agent-answers.jsonl"),
    result.answers.map((r) => JSON.stringify(r)).join("\n") + "\n"
  );
  writeFileSync(join(OUT, "agent-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(3);
});
