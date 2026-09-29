#!/usr/bin/env node
/**
 * Offline retrieval factorial for pageindex-ab (no LLM).
 *
 * Modes:
 *   --corpus contaminated-smoke   (default; NEVER cite for product decisions)
 *   --corpus freeze-candidate     (synthetic candidate; not spent freeze)
 *
 * For each confirmatory arm × question, retrieve top section ids (or code paths),
 * emit answer-contract JSONL, and print citation / contrast metrics.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
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
      const add = 1 / (k + i + 1);
      scores.set(item.id, (scores.get(item.id) || 0) + add);
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
      else if (/\.(ts|js|tsx|jsx|py|go|rs|java)$/.test(ent.name)) out.push(rel);
    }
  }
  walk(repoRoot);
  return out;
}

function rankCodeFiles(codeDir, documentId, query, ranker) {
  const root = join(codeDir, documentId);
  const files = listCodeFiles(root);
  const docs = files.map((f) => ({
    id: f.startsWith("src/") || f.startsWith("test/") ? f : f,
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

function resolveDocPath(docsDir, documentId) {
  const direct = join(docsDir, `${documentId}.md`);
  if (existsSync(direct)) return direct;
  return null;
}

async function retrieveForArm(cfg, arm, key) {
  if (key.stratum === "code") {
    process.env.CLAWQL_MEMORY_VAULT_RANKER = arm.ranker;
    const ranked = rankCodeFiles(cfg.codeDir, key.document_id, key.question, arm.ranker);
    return ranked.slice(0, 3);
  }

  const docIds =
    key.related_document_ids && key.related_document_ids.length
      ? key.related_document_ids
      : [key.document_id];

  const lists = [];
  for (const docId of docIds) {
    const path = resolveDocPath(cfg.docsDir, docId);
    if (!path) continue;
    const markdown = readFileSync(path, "utf8");
    process.env.CLAWQL_MEMORY_VAULT_RANKER = arm.ranker;
    const vaultRanked = rankSectionsVault(markdown, key.question, arm.ranker);
    let ranked = vaultRanked;
    if (arm.pageindex) {
      const tmp = mkdtempSync(join(tmpdir(), "piab-pi-"));
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
