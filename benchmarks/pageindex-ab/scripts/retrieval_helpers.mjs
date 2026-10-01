/**
 * Shared retrieval helpers for pageindex-ab offline / agent-lite pilots.
 *
 * Merge modes:
 *   - rrf: same-size top-k RRF of vault + PageIndex (displaces vault hits)
 *   - union: vault top-k plus PageIndex hits not already present (matches
 *     "context is cheap" product rule — no forced displacement)
 *   - gated: enable PageIndex only when headingQualityScore(markdown) >= threshold
 */

import {
  readFileSync,
  mkdtempSync,
  rmSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildVaultRankerStats,
  resolveVaultRankerModeEffect,
  scoreWithVaultRanker,
} from "clawql-memory/recall/vault-ranker";
import { splitMarkdownSections } from "clawql-memory/recall/read-around";
import { Effect } from "effect";

/** Optional — clawql-pageindex was purged in 8.0; H-idf / vault arms still run. */
let pageindexBuildTree = null;
let pageindexTraverse = null;
let pageindexLoadError = null;
try {
  const pi = await import("clawql-pageindex/mcp");
  pageindexBuildTree = pi.pageindexBuildTree;
  pageindexTraverse = pi.pageindexTraverse;
} catch (err) {
  pageindexLoadError = err;
}

export function pageindexAvailable() {
  return Boolean(pageindexBuildTree && pageindexTraverse);
}

/**
 * TOP_K_DOC locked at 10 for *content* keys (see design/recall-by-question-class.md).
 * Pooled k20 recall climb was depth/position templates only; content R@3 already 1.0.
 * Judge MaxP by content recall@10 + content model accuracy — not position-within-10.
 */
export const TOP_K_DOC = 10;
export const TOP_K_MULTI = 5;
export const HEADING_QUALITY_THRESHOLD = 0.35;

/**
 * Agents (and finalize) must see section identity.
 * - Code: `// file: path` — without it, "which file exports X?" is unanswerable.
 * - Docs: `### {doc} · §{num} · {heading} · ~{pct}% through document`
 *   cheap citation aid + enables structural/depth questions later.
 */
export function formatSectionEvidence(section, opts = {}) {
  const id = section?.id || "";
  const title = section?.title || section?.heading_path || "";
  const body = section?.content || section?.text || "";
  const docTitle =
    opts.docTitle || section?.docTitle || section?.document_title || "";
  const sectionIndex =
    opts.sectionIndex ?? section?.sectionIndex ?? section?.section_index;
  const sectionCount =
    opts.sectionCount ?? section?.sectionCount ?? section?.section_count;

  if (id.includes("/") || /\.(ts|js|tsx|jsx|py|go|rs)$/i.test(id)) {
    const line = `// file: ${id}`;
    if (body.startsWith(line)) return body;
    return `${line}\n${body}`;
  }

  const numMatch = String(title).match(/^(\d+(?:\.\d+)*)\b/);
  const secNum = numMatch ? numMatch[1] : "";
  let pct = "";
  if (
    typeof sectionIndex === "number" &&
    typeof sectionCount === "number" &&
    sectionCount > 0
  ) {
    pct = String(Math.round((100 * (sectionIndex + 0.5)) / sectionCount));
  }
  const parts = [];
  if (docTitle) parts.push(docTitle);
  if (secNum) parts.push(`§${secNum}`);
  if (title) parts.push(title);
  else if (id) parts.push(id);
  if (pct) parts.push(`~${pct}% through document`);
  const header = parts.join(" · ");
  if (!header) return body;
  const prefix = `### ${header}`;
  if (body.startsWith(prefix)) return body;
  return `${prefix}\n\n${body}`;
}

export function annotateSectionsForEvidence(sections, docTitle = "") {
  const n = sections.length;
  return sections.map((s, i) => ({
    ...s,
    docTitle: docTitle || s.docTitle || "",
    sectionIndex: i,
    sectionCount: n,
  }));
}

export function rankSectionsVault(markdown, query, rankerMode) {
  const sections = splitMarkdownSections(markdown);
  const docTitle = sections.find((s) => s.level === 1)?.title || "";
  const annotated = annotateSectionsForEvidence(sections, docTitle);
  const texts = annotated.map((s) => s.content);
  const stats = buildVaultRankerStats(texts, rankerMode);
  return annotated
    .map((s) => ({
      id: s.id,
      title: s.title,
      docTitle: s.docTitle,
      sectionIndex: s.sectionIndex,
      sectionCount: s.sectionCount,
      score: scoreWithVaultRanker(query, s.content, stats),
      content: formatSectionEvidence(s),
    }))
    .sort((a, b) => b.score - a.score);
}

export async function rankSectionsPageindex(docId, markdown, query, storagePath) {
  if (!pageindexAvailable()) {
    throw new Error(
      `clawql-pageindex unavailable (purged): ${pageindexLoadError?.message || "import failed"}`,
    );
  }
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
        content: formatSectionEvidence(sec),
      });
    }
  }
  const seen = new Set();
  return ranked.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

export function rrfMerge(lists, k = 60) {
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

/** Vault top-k first, then PageIndex hits not already present (no displacement). */
export function unionMerge(vaultRanked, piRanked, topK = TOP_K_DOC) {
  const vaultTop = vaultRanked.slice(0, topK);
  const seen = new Set(vaultTop.map((x) => x.id));
  const out = vaultTop.map((x) => ({ ...x }));
  for (const item of piRanked) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push({ ...item });
  }
  return out;
}

/**
 * Cheap heading-quality score in [-0.75, 1].
 * High when many numbered / Article / Section titles; low with boilerplate / junk titles.
 */
export function headingQualityScore(markdown) {
  const sections = splitMarkdownSections(markdown);
  if (sections.length < 2) return 0;
  let numbered = 0;
  let boilerplate = 0;
  let short = 0;
  for (const s of sections) {
    const t = String(s.title || "").trim();
    if (
      /^\d+(\.\d+)*[\s.).-]/.test(t) ||
      /^article\s+[ivxlcdm\d]+/i.test(t) ||
      /^section\s+\d/i.test(t) ||
      /^appendix\s+[a-z0-9]/i.test(t)
    ) {
      numbered++;
    }
    if (
      /boilerplate|miscellaneous provisions that look like|untitled|page \d+|speaker\s*\d/i.test(
        t
      )
    ) {
      boilerplate++;
    }
    if (t.length > 0 && t.length < 4) short++;
  }
  const n = sections.length;
  return numbered / n - 0.5 * (boilerplate / n) - 0.25 * (short / n);
}

export function listCodeFiles(repoRoot) {
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

export function rankCodeFiles(codeDir, documentId, query, ranker) {
  const root = join(codeDir, documentId);
  const files = listCodeFiles(root);
  const docs = files.map((f) => ({
    id: f,
    // Rank on raw file bytes; expose path in the evidence payload.
    raw: readFileSync(join(root, f), "utf8"),
  }));
  process.env.CLAWQL_MEMORY_VAULT_RANKER = ranker;
  const mode = Effect.runSync(resolveVaultRankerModeEffect());
  const stats = buildVaultRankerStats(
    docs.map((d) => d.raw),
    mode
  );
  return docs
    .map((d) => ({
      id: d.id,
      title: d.id,
      heading_path: d.id,
      score: scoreWithVaultRanker(query, d.raw, stats),
      content: formatSectionEvidence({ id: d.id, title: d.id, content: d.raw }),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * @param {object} arm
 * @param {string} arm.ranker
 * @param {boolean} arm.pageindex
 * @param {"rrf"|"union"} [arm.piMerge]
 * @param {boolean} [arm.piGated]  enable PI only when heading quality passes
 * @param {number} [arm.headingThreshold]
 */
export async function retrieveDocumentLists(docsDir, arm, key) {
  const docIds =
    key.related_document_ids && key.related_document_ids.length
      ? key.related_document_ids
      : [key.document_id];

  const perDoc = [];
  for (const docId of docIds) {
    const path = join(docsDir, `${docId}.md`);
    if (!existsSync(path)) continue;
    const markdown = readFileSync(path, "utf8");
    process.env.CLAWQL_MEMORY_VAULT_RANKER = arm.ranker;
    const vaultRanked = rankSectionsVault(markdown, key.question, arm.ranker);
    const hq = headingQualityScore(markdown);
    const threshold = arm.headingThreshold ?? HEADING_QUALITY_THRESHOLD;
    const wantPi = Boolean(arm.pageindex) && (!arm.piGated || hq >= threshold);
    let piRanked = [];
    let ranked = vaultRanked;
    let mergeMode = "vault_only";
    if (wantPi) {
      const tmp = mkdtempSync(join(tmpdir(), "piab-pi-"));
      const storagePath = join(tmp, "pageindex.db.json");
      try {
        piRanked = await rankSectionsPageindex(docId, markdown, key.question, storagePath);
        if (arm.piMerge === "union") {
          ranked = unionMerge(vaultRanked, piRanked, TOP_K_DOC);
          mergeMode = "union";
        } else {
          ranked = rrfMerge([vaultRanked, piRanked]);
          mergeMode = "rrf";
        }
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    } else if (arm.pageindex && arm.piGated) {
      mergeMode = "gated_off";
    }
    perDoc.push({
      docId,
      markdown,
      headingQuality: hq,
      vaultRanked,
      piRanked,
      ranked,
      mergeMode,
      wantPi,
    });
  }
  return perDoc;
}

export async function retrieveForArm(cfg, arm, key) {
  if (key.stratum === "code") {
    return rankCodeFiles(cfg.codeDir, key.document_id, key.question, arm.ranker).slice(
      0,
      TOP_K_DOC
    );
  }
  const perDoc = await retrieveDocumentLists(cfg.docsDir, arm, key);
  if (!perDoc.length) return [];
  if (perDoc.length === 1) {
    const topK = arm.piMerge === "union" && perDoc[0].mergeMode === "union" ? Infinity : TOP_K_DOC;
    return topK === Infinity ? perDoc[0].ranked : perDoc[0].ranked.slice(0, TOP_K_DOC);
  }
  return rrfMerge(perDoc.map((d) => d.ranked)).slice(0, TOP_K_MULTI);
}

export function goldInTop(sections, gold, topK = TOP_K_DOC) {
  const top = new Set(sections.slice(0, topK).map((s) => (typeof s === "string" ? s : s.id)));
  const g = gold || [];
  return g.filter((id) => top.has(id));
}

export function anyGoldIn(sections, gold) {
  const set = new Set(sections.map((s) => (typeof s === "string" ? s : s.id)));
  return (gold || []).some((id) => set.has(id));
}
