#!/usr/bin/env node
/**
 * Free offline displacement check for pageindex-ab hard-candidate.
 *
 * Question: for converted_pdf (and optionally all) questions where RRF
 * PageIndex loses vs IDF, was the gold section in IDF's top-k before the
 * same-size merge pushed it out? Also grades union and heading-gated arms.
 *
 * Usage:
 *   node benchmarks/pageindex-ab/scripts/run_displacement_check.mjs
 *   node benchmarks/pageindex-ab/scripts/run_displacement_check.mjs --corpus hard-candidate
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  retrieveDocumentLists,
  unionMerge,
  rrfMerge,
  goldInTop,
  anyGoldIn,
  TOP_K_DOC,
  HEADING_QUALITY_THRESHOLD,
} from "./retrieval_helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function parseArgs(argv) {
  let corpus = "hard-candidate";
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--corpus" && argv[i + 1]) corpus = argv[++i];
  }
  return { corpus };
}

function resolveCorpus(corpus) {
  if (corpus === "hard-candidate") {
    return {
      tag: "pageindex-ab-v1-hard-candidate",
      keysPath: join(ROOT, "corpus", "hard-candidate", "keys.jsonl"),
      docsDir: join(ROOT, "corpus", "hard-candidate", "docs"),
      outDir: join(ROOT, "results", "hard-candidate"),
    };
  }
  throw new Error(`unsupported --corpus ${corpus} (displacement check targets hard-candidate)`);
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
  return { answer: "", not_found: true };
}

function gradeExtract(top, key) {
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
  const sections = top.map((t) => t.id);
  const cite = citationF1(sections, key.gold_sections || []);
  let ok = false;
  if (key.unanswerable) {
    ok = !!not_found;
  } else {
    const variants = [key.normalized_answer, ...(key.accepted_variants || [])].map(normalize);
    const ans = normalize(answer);
    const textOk = variants.some((v) => v && (ans === v || ans.includes(v) || v.includes(ans)));
    const citeOk = !key.gold_sections?.length || cite > 0;
    ok = textOk && citeOk;
  }
  return { ok, answer, not_found, sections, cite };
}

function sliceForMode(ranked, mode) {
  if (mode === "union") return ranked; // already vault top-k ∪ pi
  return ranked.slice(0, TOP_K_DOC);
}

async function analyzeQuestion(cfg, key) {
  const armBase = { ranker: "idf", pageindex: true, piMerge: "rrf" };
  // Force PI on so we always get vault + pi lists; apply merge modes ourselves.
  const perDoc = await retrieveDocumentLists(cfg.docsDir, armBase, key);
  if (!perDoc.length) {
    return { id: key.id, error: "no_doc" };
  }
  // Single-doc questions dominate converted_pdf; multi-doc uses RRF of lists.
  let vaultRanked;
  let piRanked;
  let headingQuality;
  if (perDoc.length === 1) {
    ({ vaultRanked, piRanked, headingQuality } = perDoc[0]);
  } else {
    vaultRanked = rrfMerge(perDoc.map((d) => d.vaultRanked));
    piRanked = rrfMerge(perDoc.map((d) => d.piRanked));
    headingQuality =
      perDoc.reduce((s, d) => s + d.headingQuality, 0) / perDoc.length;
  }

  const idfTop = vaultRanked.slice(0, TOP_K_DOC);
  const rrf = rrfMerge([vaultRanked, piRanked]).slice(0, TOP_K_DOC);
  const union = unionMerge(vaultRanked, piRanked, TOP_K_DOC);
  const gatedOn = headingQuality >= HEADING_QUALITY_THRESHOLD;
  const gated = gatedOn ? rrf : idfTop;

  const gold = key.gold_sections || [];
  const modes = {
    idf: gradeExtract(idfTop, key),
    rrf,
    // graded below
  };
  const graded = {
    idf: gradeExtract(idfTop, key),
    rrf: gradeExtract(rrf, key),
    union: gradeExtract(sliceForMode(union, "union"), key),
    gated: gradeExtract(gated, key),
  };

  const goldInIdf = goldInTop(idfTop, gold);
  const goldInRrf = goldInTop(rrf, gold);
  const goldInUnion = (gold || []).filter((id) =>
    union.some((s) => s.id === id)
  );
  const displaced =
    goldInIdf.length > 0 && goldInRrf.length === 0 && !key.unanswerable;

  return {
    id: key.id,
    stratum: key.stratum,
    question_type: key.question_type,
    unanswerable: !!key.unanswerable,
    heading_quality: headingQuality,
    gated_on: gatedOn,
    gold,
    idf_top: idfTop.map((s) => s.id),
    rrf_top: rrf.map((s) => s.id),
    union_ids: union.map((s) => s.id),
    pi_top: piRanked.slice(0, TOP_K_DOC).map((s) => s.id),
    gold_in_idf_topk: goldInIdf,
    gold_in_rrf_topk: goldInRrf,
    gold_in_union: goldInUnion,
    gold_in_pi_topk: goldInTop(piRanked, gold),
    displaced,
    ok: {
      idf: graded.idf.ok,
      rrf: graded.rrf.ok,
      union: graded.union.ok,
      gated: graded.gated.ok,
    },
    answers: {
      idf: graded.idf.answer,
      rrf: graded.rrf.answer,
      union: graded.union.answer,
      gated: graded.gated.answer,
    },
  };
}

function summarize(rows, label) {
  const n = rows.length;
  const countOk = (mode) => rows.filter((r) => r.ok?.[mode]).length;
  const displaced = rows.filter((r) => r.displaced);
  const losses = rows.filter((r) => r.ok?.idf && !r.ok?.rrf);
  const gains = rows.filter((r) => !r.ok?.idf && r.ok?.rrf);
  const lossDisplaced = losses.filter((r) => r.displaced);
  const lossNotDisplaced = losses.filter((r) => !r.displaced);
  const unionRecovers = losses.filter((r) => r.ok?.union);
  const gatedKeeps = losses.filter((r) => r.ok?.gated);
  return {
    label,
    n,
    strict: {
      idf: countOk("idf") / n,
      rrf: countOk("rrf") / n,
      union: countOk("union") / n,
      gated: countOk("gated") / n,
    },
    strict_counts: {
      idf: countOk("idf"),
      rrf: countOk("rrf"),
      union: countOk("union"),
      gated: countOk("gated"),
    },
    idf_to_rrf: {
      losses: losses.length,
      gains: gains.length,
      net: gains.length - losses.length,
      losses_displaced: lossDisplaced.length,
      losses_not_displaced: lossNotDisplaced.length,
      fraction_losses_displaced:
        losses.length === 0 ? null : lossDisplaced.length / losses.length,
      union_recovers_of_losses: unionRecovers.length,
      gated_keeps_of_losses: gatedKeeps.length,
    },
    displaced_total: displaced.length,
  };
}

async function main() {
  const { corpus } = parseArgs(process.argv);
  const cfg = resolveCorpus(corpus);
  if (!existsSync(cfg.keysPath)) {
    throw new Error(`keys missing: ${cfg.keysPath}`);
  }
  mkdirSync(cfg.outDir, { recursive: true });
  const keys = loadJsonl(cfg.keysPath);

  const rows = [];
  for (const key of keys) {
    if (key.stratum === "code") continue;
    process.stderr.write(".");
    rows.push(await analyzeQuestion(cfg, key));
  }
  process.stderr.write("\n");

  const byStratum = {};
  for (const r of rows) {
    if (!byStratum[r.stratum]) byStratum[r.stratum] = [];
    byStratum[r.stratum].push(r);
  }

  // RFC / well_structured miss taxonomy on IDF: retrieval vs extraction
  const well = byStratum.well_structured || [];
  const wellMisses = well.filter((r) => !r.ok?.idf && !r.unanswerable);
  const wellRetrieval = wellMisses.filter((r) => !anyGoldIn(r.idf_top, r.gold));
  const wellExtraction = wellMisses.filter((r) => anyGoldIn(r.idf_top, r.gold));

  const converted = byStratum.converted_pdf || [];
  const report = {
    tag: cfg.tag,
    warning:
      "Offline displacement diagnostic — not confirmatory; does not flip defaults",
    heading_quality_threshold: HEADING_QUALITY_THRESHOLD,
    top_k: TOP_K_DOC,
    overall: summarize(rows, "all_doc_strata"),
    by_stratum: Object.fromEntries(
      Object.entries(byStratum).map(([k, v]) => [k, summarize(v, k)])
    ),
    converted_pdf_losses: converted
      .filter((r) => r.ok?.idf && !r.ok?.rrf)
      .map((r) => ({
        id: r.id,
        type: r.question_type,
        displaced: r.displaced,
        gold_in_idf_topk: r.gold_in_idf_topk,
        gold_in_rrf_topk: r.gold_in_rrf_topk,
        gold_in_union: r.gold_in_union,
        union_ok: r.ok.union,
        gated_on: r.gated_on,
        gated_ok: r.ok.gated,
        heading_quality: r.heading_quality,
        idf_top: r.idf_top,
        rrf_top: r.rrf_top,
        pi_top: r.pi_top,
      })),
    well_structured_idf_misses: {
      n: wellMisses.length,
      retrieval_gold_not_in_topk: wellRetrieval.length,
      extraction_gold_in_topk: wellExtraction.length,
      note: "All counts are offline extractAnswer grades on H-idf top-k.",
    },
    interpretation: {
      keep_default: "H-idf",
      agent_lite_underpowered:
        "−12.5 points on n=24 / 1 trial ≈ 3 questions; binomial exact p≈0.25 under all-against-PI — noise, not clear negative",
      converted_pdf_signal:
        "Net 28→19 (9) on converted_pdf offline; check losses_displaced fraction",
      product_rule_mismatch:
        "RRF same-size top-k displaces IDF hits; union arm matches cheap-context rule",
      codegraph: "Untested — code stratum ceilinged; file-ranker proxy only",
    },
  };

  writeFileSync(
    join(cfg.outDir, "displacement-report.json"),
    JSON.stringify(report, null, 2)
  );
  writeFileSync(
    join(cfg.outDir, "displacement-rows.jsonl"),
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n"
  );

  // Compact artifact for /opt/cursor
  try {
    mkdirSync("/opt/cursor/artifacts", { recursive: true });
    writeFileSync(
      "/opt/cursor/artifacts/pageindex-displacement-report.json",
      JSON.stringify(report, null, 2)
    );
  } catch {
    /* optional */
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
