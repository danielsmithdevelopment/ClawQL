#!/usr/bin/env node
/**
 * Export keyword ∪ vector top-N candidate pools for cross-encoder rerank bakeoff.
 *
 * Per answerable key with gold:
 *   - keyword IDF top-N section ranks
 *   - local MiniLM vector top-N
 *   - union (kw then vec, deduped) — feed this to the reranker
 *   - stratified tune/holdout label (same seed as gold-rank diagnostics)
 *
 * Usage:
 *   node benchmarks/pageindex-ab/scripts/export_rerank_candidates.mjs
 *   node benchmarks/pageindex-ab/scripts/export_rerank_candidates.mjs --pool 100
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildVaultRankerStats,
  scoreWithVaultRanker,
} from "clawql-memory/recall/vault-ranker";
import { splitMarkdownSections } from "clawql-memory/recall/read-around";
import {
  embedTexts,
  rankDocumentsByChunkSimilarity,
  DEFAULT_LOCAL_EMBEDDING_MODEL,
} from "clawql-memory/embedding/embedding";
import { formatSectionEvidence, rankCodeFiles } from "./retrieval_helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function parseArgs(argv) {
  const out = {
    corpus: join(ROOT, "corpus", "hard-candidate"),
    outDir: join(ROOT, "design"),
    pool: 100,
    tuneFrac: 0.6,
    seed: 20261015,
    skipVector: false,
    // Default uncapped for MaxP / long-context rerankers; use --max-chars 2000 for lean exports.
    maxChars: 100_000,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pool" && argv[i + 1]) out.pool = Number(argv[++i]);
    else if (a === "--skip-vector") out.skipVector = true;
    else if (a === "--out" && argv[i + 1]) out.outDir = argv[++i];
    else if (a === "--seed" && argv[i + 1]) out.seed = Number(argv[++i]);
    else if (a === "--tune-frac" && argv[i + 1]) out.tuneFrac = Number(argv[++i]);
    else if (a === "--max-chars" && argv[i + 1]) out.maxChars = Number(argv[++i]);
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

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stratifiedSplit(keys, tuneFrac, seed) {
  const by = new Map();
  for (const k of keys) {
    const s = k.stratum || "unknown";
    if (!by.has(s)) by.set(s, []);
    by.get(s).push(k);
  }
  const rng = mulberry32(seed);
  const tuneIds = new Set();
  for (const s of [...by.keys()].sort()) {
    const arr = by.get(s).slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const nTune = Math.max(1, Math.floor(arr.length * tuneFrac));
    for (const k of arr.slice(0, nTune)) tuneIds.add(k.id);
  }
  return tuneIds;
}

function withHeadingPaths(sections, docId) {
  const docTitle = String(docId).match(/^rfc(\d+)$/i)
    ? `RFC ${RegExp.$1}`
    : String(docId).replace(/[-_]/g, " ");
  const stack = [];
  return sections.map((s) => {
    if (s.id !== "sec-preamble" && s.level > 0) {
      while (stack.length && stack[stack.length - 1].level >= s.level) stack.pop();
      stack.push({ level: s.level, title: s.title });
    }
    const heading_path = [docTitle, ...stack.map((x) => x.title)].filter(Boolean).join(" › ");
    return { ...s, heading_path };
  });
}

function rankKeyword(sections, query) {
  const texts = sections.map((s) => s.content || "");
  const stats = buildVaultRankerStats(texts, "idf");
  return sections
    .map((s, i) => ({
      id: s.id,
      title: s.title,
      heading_path: s.heading_path || s.title,
      score: scoreWithVaultRanker(query, texts[i], stats),
      text: s.content || "",
    }))
    .sort((a, b) => b.score - a.score);
}

function unionPool(kwList, vecList, pool) {
  const kwTop = kwList.slice(0, pool);
  const vecTop = vecList.slice(0, pool);
  const seen = new Set();
  const out = [];
  for (const item of kwTop) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push({
      id: item.id,
      title: item.title,
      heading_path: item.heading_path || item.title,
      text: item.text,
      kw_rank: kwTop.findIndex((x) => x.id === item.id) + 1,
      vec_rank: null,
      sources: ["keyword"],
    });
  }
  for (const item of vecTop) {
    const vr = vecTop.findIndex((x) => x.id === item.id) + 1;
    if (seen.has(item.id)) {
      const prev = out.find((x) => x.id === item.id);
      prev.vec_rank = vr;
      if (!prev.sources.includes("vector")) prev.sources.push("vector");
      continue;
    }
    seen.add(item.id);
    out.push({
      id: item.id,
      title: item.title,
      heading_path: item.heading_path || item.title,
      text: item.text,
      kw_rank: null,
      vec_rank: vr,
      sources: ["vector"],
    });
  }
  return out;
}

function clip(s, n) {
  const t = String(s || "");
  return t.length <= n ? t : t.slice(0, n);
}

async function main() {
  const args = parseArgs(process.argv);
  const keys = loadJsonl(join(args.corpus, "keys.jsonl")).filter(
    (k) => !k.unanswerable && (k.gold_sections || []).length > 0,
  );
  const tuneIds = stratifiedSplit(keys, args.tuneFrac, args.seed);

  const embCfg = {
    provider: "local",
    baseUrl: "",
    model: DEFAULT_LOCAL_EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2",
    apiKey: "",
  };
  const vecCache = new Map();
  const qCache = new Map();

  const byDoc = new Map();
  for (const key of keys) {
    if (!byDoc.has(key.document_id)) byDoc.set(key.document_id, []);
    byDoc.get(key.document_id).push(key);
  }

  const rows = [];
  let di = 0;
  for (const [docId, docKeys] of byDoc) {
    di++;
    const isCode = docKeys[0]?.stratum === "code";
    let sections = null;
    let sectionVecs = null;

    if (!isCode) {
      const path = join(args.corpus, "docs", `${docId}.md`);
      if (!existsSync(path)) continue;
      const md = readFileSync(path, "utf8");
      sections = withHeadingPaths(splitMarkdownSections(md), docId);
      if (!args.skipVector && sections.length) {
        process.stderr.write(`\rembed ${di}/${byDoc.size} ${docId} n=${sections.length}   `);
        if (!vecCache.has(docId)) {
          const { vectors } = await embedTexts(
            sections.map((s) => s.content),
            embCfg,
          );
          vecCache.set(docId, vectors);
        }
        sectionVecs = vecCache.get(docId);
      }
    }

    for (const key of docKeys) {
      const gold = key.gold_sections || [];
      let kwRanked = [];
      let vecRanked = [];

      if (isCode) {
        kwRanked = rankCodeFiles(
          join(args.corpus, "code"),
          docId,
          key.question,
          "idf",
        ).map((r) => ({
          id: r.id,
          title: r.title || r.id,
          heading_path: r.id,
          score: r.score,
          // rankCodeFiles already path-prefixes; keep as text for finalize.
          text: r.content || "",
        }));
      } else if (sections) {
        kwRanked = rankKeyword(sections, key.question);
        if (sectionVecs) {
          let qVec = qCache.get(key.question);
          if (!qVec) {
            const { vectors } = await embedTexts([key.question], embCfg);
            qVec = vectors[0];
            qCache.set(key.question, qVec);
          }
          const chunks = sections.map((s, i) => ({
            documentPath: s.id,
            chunkId: s.id,
            text: s.content,
            embedding: sectionVecs[i],
          }));
          const ranked = rankDocumentsByChunkSimilarity(qVec, chunks, {
            topChunks: Math.max(sections.length, 1),
            maxDocs: Math.max(sections.length, 1),
          });
          const byId = new Map(sections.map((s) => [s.id, s]));
          vecRanked = ranked.map((r) => {
            const id = r.chunkId || r.path;
            const s = byId.get(id);
            return {
              id,
              title: s?.title,
              heading_path: s?.heading_path || s?.title,
              score: r.score,
              text: formatSectionEvidence({
                id,
                title: s?.heading_path || s?.title || id,
                content: s?.content || "",
              }),
            };
          });
        }
      }

      const pool = unionPool(kwRanked, vecRanked, args.pool);
      const goldSet = new Set(gold);
      const poolIds = new Set(pool.map((p) => p.id));
      const goldInPool = gold.some((g) => poolIds.has(g));
      const bestKw = (() => {
        let b = null;
        kwRanked.forEach((r, i) => {
          if (goldSet.has(r.id)) b = b == null ? i + 1 : Math.min(b, i + 1);
        });
        return b;
      })();
      const bestVec = (() => {
        let b = null;
        vecRanked.forEach((r, i) => {
          if (goldSet.has(r.id)) b = b == null ? i + 1 : Math.min(b, i + 1);
        });
        return b;
      })();

      rows.push({
        id: key.id,
        document_id: docId,
        stratum: key.stratum,
        split: tuneIds.has(key.id) ? "tune" : "holdout",
        question: key.question,
        question_type: key.question_type,
        normalized_answer: key.normalized_answer,
        accepted_variants: key.accepted_variants || [],
        gold_sections: gold,
        keyword_gold_rank: bestKw,
        vector_gold_rank: bestVec,
        pool_size: pool.length,
        pool_has_gold: goldInPool,
        candidates: pool.map((c) => ({
          id: c.id,
          title: c.title,
          heading_path: c.heading_path || c.title,
          text: clip(
            formatSectionEvidence({
              id: c.id,
              title: c.heading_path || c.title || c.id,
              content: c.text || "",
            }),
            args.maxChars,
          ),
          kw_rank: c.kw_rank,
          vec_rank: c.vec_rank,
          sources: c.sources,
        })),
      });
    }
  }
  process.stderr.write("\n");

  mkdirSync(args.outDir, { recursive: true });
  const outPath = join(args.outDir, "rerank-candidates.jsonl");
  writeFileSync(outPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

  const summary = {
    tag: "pageindex-ab-rerank-candidates-v1",
    generated_at: new Date().toISOString(),
    pool_per_retriever: args.pool,
    n: rows.length,
    tune_n: rows.filter((r) => r.split === "tune").length,
    holdout_n: rows.filter((r) => r.split === "holdout").length,
    pool_has_gold_rate: rows.filter((r) => r.pool_has_gold).length / rows.length,
    mean_pool_size: rows.reduce((s, r) => s + r.pool_size, 0) / rows.length,
    vector_enabled: !args.skipVector,
    embedding_model: embCfg.model,
    path: outPath,
  };
  writeFileSync(
    join(args.outDir, "rerank-candidates.summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(JSON.stringify(summary, null, 2));
  console.error(JSON.stringify({ ok: true, wrote: outPath }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.stack || err) }));
  process.exit(1);
});
