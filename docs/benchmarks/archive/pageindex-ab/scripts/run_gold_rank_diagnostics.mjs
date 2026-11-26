#!/usr/bin/env node
/**
 * Track C — offline gold-rank diagnostics (keyword / vector / RRF / contextual headers).
 *
 * For each answerable key with gold sections, record the best gold rank under:
 *   - keyword IDF (section body as indexed today)
 *   - vector (local MiniLM over section bodies)
 *   - RRF(keyword, vector) — same formula as product hybrid-rerank
 *   - keyword + contextual headers (doc title › heading path prepended)
 *   - vector + contextual headers
 *   - RRF of the two contextual lists
 *
 * Classifies keys that miss @10:
 *   - merge: one lone retriever has gold ≤10 but RRF does not
 *   - rerank: gold in (10, 50] on best lone/RRF list
 *   - deep_rerank: gold in (50, 100]
 *   - index_mismatch: gold >100 or absent on all lists
 *
 * Eval hygiene: stratified tune/holdout split (default 60/40). Report both;
 * treat tune as the development signal; holdout is a one-shot check only.
 *
 * Usage:
 *   node benchmarks/pageindex-ab/scripts/run_gold_rank_diagnostics.mjs
 *   node benchmarks/pageindex-ab/scripts/run_gold_rank_diagnostics.mjs --skip-vector
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
import { rrfMerge, rankCodeFiles } from "./retrieval_helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function parseArgs(argv) {
  const out = {
    corpus: join(ROOT, "corpus", "hard-candidate"),
    outDir: join(ROOT, "design"),
    skipVector: false,
    tuneFrac: 0.6,
    seed: 20261015,
    ks: [10, 50, 100],
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--skip-vector") out.skipVector = true;
    else if (a === "--tune-frac" && argv[i + 1]) out.tuneFrac = Number(argv[++i]);
    else if (a === "--seed" && argv[i + 1]) out.seed = Number(argv[++i]);
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
  const tune = [];
  const holdout = [];
  for (const s of [...by.keys()].sort()) {
    const arr = by.get(s).slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const nTune = Math.max(1, Math.floor(arr.length * tuneFrac));
    tune.push(...arr.slice(0, nTune));
    holdout.push(...arr.slice(nTune));
  }
  return { tune, holdout };
}

function docTitleFromId(docId) {
  const m = String(docId).match(/^rfc(\d+)$/i);
  if (m) return `RFC ${m[1]}`;
  return String(docId).replace(/[-_]/g, " ");
}

/** Attach heading-path contextual header to each section (deterministic, no LLM). */
function sectionsWithContext(markdown, docId) {
  const sections = splitMarkdownSections(markdown);
  const docTitle = docTitleFromId(docId);
  const stack = [];
  return sections.map((s) => {
    if (s.id !== "sec-preamble" && s.level > 0) {
      while (stack.length && stack[stack.length - 1].level >= s.level) stack.pop();
      stack.push({ level: s.level, title: s.title });
    }
    const pathParts = [docTitle, ...stack.map((x) => x.title)];
    const header = pathParts.filter(Boolean).join(" › ");
    return {
      id: s.id,
      title: s.title,
      level: s.level,
      content: s.content,
      header,
      contentCtx: `${header}\n\n${s.content}`,
    };
  });
}

function rankKeyword(sections, query, textField = "content") {
  const texts = sections.map((s) => s[textField] || "");
  const stats = buildVaultRankerStats(texts, "idf");
  return sections
    .map((s, i) => ({
      id: s.id,
      title: s.title,
      score: scoreWithVaultRanker(query, texts[i], stats),
      content: s.content,
    }))
    .sort((a, b) => b.score - a.score);
}

function bestGoldRank(ranked, goldSet) {
  if (!goldSet.size) return null;
  let best = Infinity;
  ranked.forEach((r, i) => {
    if (goldSet.has(r.id)) best = Math.min(best, i + 1); // 1-based
  });
  return best === Infinity ? null : best;
}

function recallAt(ranks, k) {
  const usable = ranks.filter((r) => r != null);
  if (!usable.length) return null;
  return usable.filter((r) => r <= k).length / usable.length;
}

function meanRank(ranks) {
  const usable = ranks.filter((r) => r != null);
  if (!usable.length) return null;
  return usable.reduce((a, b) => a + b, 0) / usable.length;
}

function classifyMiss(row) {
  // Miss @10 on keyword (today's eval default path)
  const kw = row.ranks.keyword;
  if (kw != null && kw <= 10) return null; // hit
  const candidates = [
    ["keyword", row.ranks.keyword],
    ["vector", row.ranks.vector],
    ["rrf", row.ranks.rrf],
    ["keyword_ctx", row.ranks.keyword_ctx],
    ["vector_ctx", row.ranks.vector_ctx],
    ["rrf_ctx", row.ranks.rrf_ctx],
  ].filter(([, r]) => r != null);

  const bestLone = Math.min(
    ...[
      row.ranks.keyword,
      row.ranks.vector,
      row.ranks.keyword_ctx,
      row.ranks.vector_ctx,
    ].filter((r) => r != null),
    Infinity,
  );
  const rrf = row.ranks.rrf;
  const rrfCtx = row.ranks.rrf_ctx;

  // Merge: a lone list has ≤10 but RRF does not
  const loneHits10 = [row.ranks.keyword, row.ranks.vector].some((r) => r != null && r <= 10);
  if (loneHits10 && (rrf == null || rrf > 10)) {
    return {
      class: "merge",
      detail: "lone retriever ≤10 but RRF >10 — fusion buries the gold",
    };
  }

  const bestAny = Math.min(...candidates.map(([, r]) => r), Infinity);
  if (bestAny === Infinity) {
    return { class: "index_mismatch", detail: "gold absent from all ranked lists" };
  }
  if (bestAny <= 10) {
    // keyword miss but another method hits — still actionable
    if (row.ranks.keyword_ctx != null && row.ranks.keyword_ctx <= 10) {
      return { class: "contextual_header_fix", detail: "keyword_ctx ≤10 while keyword >10" };
    }
    if (row.ranks.vector != null && row.ranks.vector <= 10) {
      return { class: "vector_rescue", detail: "vector ≤10 while keyword >10" };
    }
    if (rrf != null && rrf <= 10) {
      return { class: "merge_helps", detail: "RRF ≤10 while keyword >10" };
    }
    return { class: "other_rescue", detail: `bestAny=${bestAny}` };
  }
  if (bestAny <= 50) {
    return { class: "rerank", detail: `best gold rank ${bestAny} in (10,50] — cross-encoder territory` };
  }
  if (bestAny <= 100) {
    return { class: "deep_rerank", detail: `best gold rank ${bestAny} in (50,100]` };
  }
  return {
    class: "index_mismatch",
    detail: `best gold rank ${bestAny} >100 — wording/index mismatch; contextual headers or rewrite`,
  };
}

function summarizeSplit(rows, label) {
  const rankKeys = ["keyword", "vector", "rrf", "keyword_ctx", "vector_ctx", "rrf_ctx"];
  const byMethod = {};
  for (const m of rankKeys) {
    const ranks = rows.map((r) => r.ranks[m]);
    byMethod[m] = {
      n: ranks.filter((x) => x != null).length,
      recall_at_10: recallAt(ranks, 10),
      recall_at_50: recallAt(ranks, 50),
      recall_at_100: recallAt(ranks, 100),
      mean_rank: meanRank(ranks),
      median_rank: (() => {
        const u = ranks.filter((x) => x != null).sort((a, b) => a - b);
        if (!u.length) return null;
        const mid = Math.floor(u.length / 2);
        return u.length % 2 ? u[mid] : (u[mid - 1] + u[mid]) / 2;
      })(),
    };
  }

  const missKw10 = rows.filter((r) => r.ranks.keyword == null || r.ranks.keyword > 10);
  const classCounts = {};
  for (const r of missKw10) {
    const c = r.miss_class?.class || "unknown";
    classCounts[c] = (classCounts[c] || 0) + 1;
  }

  const kw = byMethod.keyword.recall_at_10 ?? 0;
  const lifts = {
    vector_vs_keyword_r10: (byMethod.vector.recall_at_10 ?? 0) - kw,
    rrf_vs_keyword_r10: (byMethod.rrf.recall_at_10 ?? 0) - kw,
    keyword_ctx_vs_keyword_r10: (byMethod.keyword_ctx.recall_at_10 ?? 0) - kw,
    rrf_ctx_vs_keyword_r10: (byMethod.rrf_ctx.recall_at_10 ?? 0) - kw,
  };

  return {
    split: label,
    n: rows.length,
    n_keyword_miss_at_10: missKw10.length,
    by_method: byMethod,
    miss_class_counts: classCounts,
    lifts_recall_at_10: lifts,
  };
}

async function embedCacheForDoc(docId, textsPlain, textsCtx, cfg, cache, skipVector) {
  if (skipVector) return { plain: null, ctx: null };
  const keyP = `${docId}::plain`;
  const keyC = `${docId}::ctx`;
  if (!cache.has(keyP)) {
    const { vectors } = await embedTexts(textsPlain, cfg);
    cache.set(keyP, vectors);
  }
  if (!cache.has(keyC)) {
    const { vectors } = await embedTexts(textsCtx, cfg);
    cache.set(keyC, vectors);
  }
  return { plain: cache.get(keyP), ctx: cache.get(keyC) };
}

function rankFromVectors(sections, queryVec, sectionVecs) {
  if (!queryVec || !sectionVecs) return [];
  const chunks = sections.map((s, i) => ({
    documentPath: s.id,
    chunkId: s.id,
    text: s.content,
    embedding: sectionVecs[i],
  }));
  const ranked = rankDocumentsByChunkSimilarity(queryVec, chunks, {
    topChunks: Math.max(sections.length, 1),
    maxDocs: Math.max(sections.length, 1),
  });
  const byId = new Map(sections.map((s) => [s.id, s]));
  return ranked.map((r) => ({
    id: r.chunkId || r.path,
    title: byId.get(r.chunkId || r.path)?.title,
    score: r.score,
    content: byId.get(r.chunkId || r.path)?.content,
  }));
}

async function main() {
  const args = parseArgs(process.argv);
  const keys = loadJsonl(join(args.corpus, "keys.jsonl")).filter(
    (k) => !k.unanswerable && (k.gold_sections || []).length > 0,
  );

  const { tune, holdout } = stratifiedSplit(keys, args.tuneFrac, args.seed);
  const tuneIds = new Set(tune.map((k) => k.id));

  const embCfg = {
    provider: "local",
    baseUrl: "",
    model: DEFAULT_LOCAL_EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2",
    apiKey: "",
  };
  const vecCache = new Map();
  const queryCache = new Map();

  console.error(
    JSON.stringify({
      phase: "start",
      n_with_gold: keys.length,
      tune: tune.length,
      holdout: holdout.length,
      skipVector: args.skipVector,
      model: embCfg.model,
    }),
  );

  const rows = [];
  // Group by document for embedding reuse
  const byDoc = new Map();
  for (const key of keys) {
    const d = key.document_id;
    if (!byDoc.has(d)) byDoc.set(d, []);
    byDoc.get(d).push(key);
  }

  let docI = 0;
  for (const [docId, docKeys] of byDoc) {
    docI++;
    const isCode = docKeys[0]?.stratum === "code";
    let sections = null;
    let emb = { plain: null, ctx: null };

    if (!isCode) {
      const path = join(args.corpus, "docs", `${docId}.md`);
      if (!existsSync(path)) {
        console.error(JSON.stringify({ warn: "missing_doc", docId }));
        continue;
      }
      const md = readFileSync(path, "utf8");
      sections = sectionsWithContext(md, docId);
      if (!args.skipVector && sections.length) {
        process.stderr.write(
          `\rembed ${docI}/${byDoc.size} ${docId} sections=${sections.length}   `,
        );
        emb = await embedCacheForDoc(
          docId,
          sections.map((s) => s.content),
          sections.map((s) => s.contentCtx),
          embCfg,
          vecCache,
          args.skipVector,
        );
      }
    }

    for (const key of docKeys) {
      const gold = new Set(key.gold_sections || []);
      let ranks = {
        keyword: null,
        vector: null,
        rrf: null,
        keyword_ctx: null,
        vector_ctx: null,
        rrf_ctx: null,
      };

      if (isCode) {
        const kw = rankCodeFiles(join(args.corpus, "code"), docId, key.question, "idf");
        ranks.keyword = bestGoldRank(kw, gold);
        // code: no section ctx path; leave others null
      } else if (sections) {
        const kw = rankKeyword(sections, key.question, "content");
        const kwCtx = rankKeyword(sections, key.question, "contentCtx");
        ranks.keyword = bestGoldRank(kw, gold);
        ranks.keyword_ctx = bestGoldRank(kwCtx, gold);

        if (!args.skipVector) {
          let qVec = queryCache.get(key.question);
          if (!qVec) {
            const { vectors } = await embedTexts([key.question], embCfg);
            qVec = vectors[0];
            queryCache.set(key.question, qVec);
          }
          const vec = rankFromVectors(sections, qVec, emb.plain);
          const vecCtx = rankFromVectors(sections, qVec, emb.ctx);
          ranks.vector = bestGoldRank(vec, gold);
          ranks.vector_ctx = bestGoldRank(vecCtx, gold);
          const rrf = rrfMerge([kw, vec], 60);
          const rrfCtx = rrfMerge([kwCtx, vecCtx], 60);
          ranks.rrf = bestGoldRank(rrf, gold);
          ranks.rrf_ctx = bestGoldRank(rrfCtx, gold);
        }
      }

      const row = {
        id: key.id,
        document_id: docId,
        stratum: key.stratum,
        split: tuneIds.has(key.id) ? "tune" : "holdout",
        gold_sections: [...gold],
        ranks,
      };
      row.miss_class = classifyMiss(row);
      rows.push(row);
    }
  }
  process.stderr.write("\n");

  const tuneRows = rows.filter((r) => r.split === "tune");
  const holdRows = rows.filter((r) => r.split === "holdout");
  const sumTune = summarizeSplit(tuneRows, "tune");
  const sumHold = summarizeSplit(holdRows, "holdout");
  const sumAll = summarizeSplit(rows, "all_signed_set_leak_risk");

  // Suggested next fix from tune lifts
  const lifts = sumTune.lifts_recall_at_10;
  const classes = sumTune.miss_class_counts;
  let nextFix = "investigate";
  let rationale = "";
  if ((lifts.keyword_ctx_vs_keyword_r10 || 0) >= 0.05) {
    nextFix = "contextual_headers";
    rationale = `keyword+heading-path lifts recall@10 by ${((lifts.keyword_ctx_vs_keyword_r10 || 0) * 100).toFixed(1)}pp on tune — cheapest likely win.`;
  } else if ((classes.merge || 0) >= (sumTune.n_keyword_miss_at_10 || 1) * 0.2) {
    nextFix = "rrf_merge";
    rationale = "≥20% of keyword@10 misses are merge burials — test CLAWQL_MEMORY_RECALL_RRF / hybrid wiring.";
  } else if ((classes.rerank || 0) + (classes.deep_rerank || 0) >= (sumTune.n_keyword_miss_at_10 || 1) * 0.35) {
    nextFix = "cross_encoder_rerank";
    rationale = "Many golds sit in ranks 11–100 — cross-encoder over top-50/100 is the standard fix.";
  } else if ((classes.index_mismatch || 0) >= (sumTune.n_keyword_miss_at_10 || 1) * 0.35) {
    nextFix = "contextual_headers_or_rewrite";
    rationale = "Golds often outside top-100 — index/query wording mismatch; contextual headers or query rewrite.";
  } else if ((lifts.vector_vs_keyword_r10 || 0) >= 0.05 || (lifts.rrf_vs_keyword_r10 || 0) >= 0.05) {
    nextFix = "hybrid_vector";
    rationale = "Vector or RRF lifts recall@10 on tune — prove CLAWQL_MEMORY_RECALL hybrid path on section retrieval.";
  } else {
    nextFix = "mixed";
    rationale = "No single class dominates; inspect per-miss rows and try contextual headers first (cheap).";
  }

  const report = {
    tag: "pageindex-ab-gold-rank-diagnostics-v1",
    generated_at: new Date().toISOString(),
    corpus: "hard-candidate",
    n_with_gold: keys.length,
    split: {
      tune_frac: args.tuneFrac,
      seed: args.seed,
      tune_n: tune.length,
      holdout_n: holdout.length,
      hygiene:
        "Signed set was used for k-sweep. Tune = development signal only. " +
        "Confirm ranking fixes on holdout here, then on fresh builder keys + human sample before claiming a ship win.",
    },
    vector: args.skipVector
      ? { enabled: false }
      : { enabled: true, provider: "local", model: embCfg.model },
    interim_default: {
      TOP_K_DOC: 20,
      note: "Ship k=20 meanwhile; ranking fixes improve what those 20 contain and help small-k clients.",
    },
    summaries: { tune: sumTune, holdout: sumHold, all: sumAll },
    recommendation: {
      next_fix: nextFix,
      rationale,
      order: [
        "diagnostics (this report)",
        "contextual headers (deterministic heading path) — measure recall@10 on tune, confirm holdout",
        "cross-encoder rerank top-50→10/20 if rerank class dominates",
        "RRF/hybrid prove-or-remove if merge class dominates",
        "model-scored accuracy confirm before claiming product win",
      ],
    },
    rows_path: "gold-rank-diagnostics-rows.jsonl",
  };

  mkdirSync(args.outDir, { recursive: true });
  const summaryPath = join(args.outDir, "gold-rank-diagnostics.json");
  const rowsPath = join(args.outDir, "gold-rank-diagnostics-rows.jsonl");
  writeFileSync(summaryPath, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(rowsPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

  console.log(JSON.stringify(report, null, 2));
  console.error(JSON.stringify({ ok: true, wrote: summaryPath, rows: rowsPath }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.stack || err) }));
  process.exit(1);
});
