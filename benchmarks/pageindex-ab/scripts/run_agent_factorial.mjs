#!/usr/bin/env node
/**
 * Cheap agent-lite factorial for pageindex-ab via OpenRouter.
 *
 * Cost posture (default):
 *   - Model: google/gemini-2.5-flash-lite (override with PAGEINDEX_AB_MODEL)
 *   - Stratified sample: PAGEINDEX_AB_LIMIT (default 24)
 *   - Mode: retrieval → single LLM completion (not full OpenCode tool loops)
 *   - Trials: PAGEINDEX_AB_TRIALS (default 1)
 *
 * Full OpenCode × clawql-inference matrix remains a follow-up (PAGEINDEX_AB_MODE=opencode).
 *
 * Exit codes: 0 ok · 2 missing key/keys · 3 OpenRouter/API failure · 4 unsupported mode
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { pageindexBuildTree, pageindexTraverse } from "clawql-pageindex/mcp";
import {
  buildVaultRankerStats,
  resolveVaultRankerModeEffect,
  scoreWithVaultRanker,
} from "clawql-memory/recall/vault-ranker";
import { splitMarkdownSections } from "clawql-memory/recall/read-around";
import { Effect } from "effect";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "results", "agent-factorial");

const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";
const DEFAULT_LIMIT = 24;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const ARMS = [
  { id: "H-idf", ranker: "idf", pageindex: false, codegraph: false },
  { id: "H-idf-pi", ranker: "idf", pageindex: true, codegraph: false },
  { id: "H-bm25", ranker: "bm25", pageindex: false, codegraph: false },
  { id: "H-bm25-pi", ranker: "bm25", pageindex: true, codegraph: false },
  { id: "H-idf-cg", ranker: "idf", pageindex: false, codegraph: true },
  { id: "H-bm25-cg", ranker: "bm25", pageindex: false, codegraph: true },
  { id: "H-idf-pi-cg", ranker: "idf", pageindex: true, codegraph: true },
  { id: "H-bm25-pi-cg", ranker: "bm25", pageindex: true, codegraph: true },
];

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
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
    };
  }
  return {
    tag: "pageindex-ab-v1-candidate",
    warning: "Synthetic freeze-candidate — not spent",
    keysPath: join(ROOT, "corpus", "freeze-candidate", "keys.jsonl"),
    docsDir: join(ROOT, "corpus", "freeze-candidate", "docs"),
    codeDir: join(ROOT, "corpus", "freeze-candidate", "code"),
  };
}

function rankSectionsVault(markdown, query, rankerMode) {
  const sections = splitMarkdownSections(markdown);
  const texts = sections.map((s) => s.content);
  const stats = buildVaultRankerStats(texts, rankerMode);
  return sections
    .map((s) => ({
      id: s.id,
      title: s.title,
      score: scoreWithVaultRanker(query, s.content, stats),
      content: s.content,
    }))
    .sort((a, b) => b.score - a.score);
}

async function rankSectionsPageindex(docId, markdown, query, storagePath) {
  await pageindexBuildTree({ docId, markdown, storagePath });
  const hits = await pageindexTraverse({ docId, query, limit: 8, storagePath });
  const sections = splitMarkdownSections(markdown);
  const byTitle = new Map(sections.map((s) => [s.title.toLowerCase(), s]));
  const ranked = [];
  for (const h of hits.hits || hits || []) {
    const title = (h.title || "").toLowerCase();
    const sec = byTitle.get(title);
    if (sec) {
      ranked.push({
        id: sec.id,
        title: sec.title,
        score: h.score ?? 1,
        content: sec.content,
      });
    }
  }
  const seen = new Set();
  return ranked.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

function rrfMerge(lists, k = 60) {
  const scores = new Map();
  for (const list of lists) {
    list.forEach((item, i) => {
      scores.set(item.id, (scores.get(item.id) || 0) + 1 / (k + i + 1));
    });
  }
  const byId = new Map();
  for (const list of lists) for (const item of list) byId.set(item.id, item);
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ ...byId.get(id), score }));
}

function listCodeFiles(repoRoot) {
  const out = [];
  function walk(dir, prefix = "") {
    if (!existsSync(dir)) return;
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(join(dir, ent.name), rel);
      else if (/\.(ts|js|tsx|jsx)$/.test(ent.name)) out.push(rel);
    }
  }
  walk(repoRoot);
  return out;
}

function rankCodeFiles(codeDir, documentId, query, ranker) {
  const root = join(codeDir, documentId);
  const files = listCodeFiles(root);
  const docs = files.map((f) => ({
    id: f,
    content: readFileSync(join(root, f), "utf8"),
  }));
  process.env.CLAWQL_MEMORY_VAULT_RANKER = ranker;
  const mode = Effect.runSync(resolveVaultRankerModeEffect());
  const stats = buildVaultRankerStats(
    docs.map((d) => d.content),
    mode
  );
  return docs
    .map((d) => ({
      id: d.id,
      title: d.id,
      score: scoreWithVaultRanker(query, d.content, stats),
      content: d.content,
    }))
    .sort((a, b) => b.score - a.score);
}

async function retrieveForArm(cfg, arm, key) {
  if (key.stratum === "code") {
    return rankCodeFiles(cfg.codeDir, key.document_id, key.question, arm.ranker).slice(0, 3);
  }
  const docIds =
    key.related_document_ids && key.related_document_ids.length
      ? key.related_document_ids
      : [key.document_id];
  const lists = [];
  for (const docId of docIds) {
    const path = join(cfg.docsDir, `${docId}.md`);
    if (!existsSync(path)) continue;
    const markdown = readFileSync(path, "utf8");
    process.env.CLAWQL_MEMORY_VAULT_RANKER = arm.ranker;
    const vaultRanked = rankSectionsVault(markdown, key.question, arm.ranker);
    let ranked = vaultRanked;
    if (arm.pageindex) {
      const tmp = mkdtempSync(join(tmpdir(), "piab-agent-"));
      const storagePath = join(tmp, "pageindex.db.json");
      try {
        const piRanked = await rankSectionsPageindex(docId, markdown, key.question, storagePath);
        ranked = rrfMerge([vaultRanked, piRanked]);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
    lists.push(ranked);
  }
  if (!lists.length) return [];
  if (lists.length === 1) return lists[0].slice(0, 3);
  return rrfMerge(lists).slice(0, 5);
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

async function runAgentLite({ apiKey, model, cfg, keys, trials, concurrency }) {
  const cells = [];
  for (const arm of ARMS) {
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
  for (const arm of ARMS) {
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

  return {
    answers,
    summaries,
    contrasts: {
      pageindex_main_effect: mean(piOn) - mean(piOff),
      bm25_main_effect: mean(bm25) - mean(idf),
      codegraph_main_effect: mean(cgOn) - mean(cgOff),
      combination_vs_today:
        summaries["H-bm25-pi-cg"].strict_accuracy - summaries["H-idf"].strict_accuracy,
    },
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  const corpus = process.env.PAGEINDEX_AB_CORPUS || "freeze-candidate";
  const mode = (process.env.PAGEINDEX_AB_MODE || "agent-lite").toLowerCase();
  const model = process.env.PAGEINDEX_AB_MODEL || DEFAULT_MODEL;
  const limit = envInt("PAGEINDEX_AB_LIMIT", DEFAULT_LIMIT);
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
  const nCells = keys.length * ARMS.length * trials;

  console.error(
    JSON.stringify({
      starting: true,
      mode: "agent-lite",
      model,
      corpus: cfg.tag,
      n_questions: keys.length,
      n_arms: ARMS.length,
      trials,
      n_cells: nCells,
      concurrency,
      cost_note: "flash-lite + single completion per cell; keep PAGEINDEX_AB_LIMIT small",
    })
  );

  let result;
  try {
    result = await runAgentLite({ apiKey, model, cfg, keys, trials, concurrency });
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
