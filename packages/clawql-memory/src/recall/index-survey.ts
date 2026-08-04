/**
 * OKF index-first recall — survey `index.md` + recent `log.md` before loading note bodies.
 * Keeps recall economical as vaults grow (agent-memory-stack Layer 1 economics).
 */

import { basename } from "node:path/posix";
import { readVaultTextFile } from "../vault/utils.js";
import { stripVaultFrontmatter } from "../vault/markdown.js";
import { keywordScore, tokenizeQuery } from "./recall.js";

export type IndexCatalogEntry = {
  /** Vault-relative path when present in catalog, else undefined. */
  path?: string;
  title: string;
  folder?: string;
  /** Catalog line score against the query. */
  score: number;
};

export type RecentLogEntry = {
  timestamp: string;
  title: string;
  path?: string;
  type?: string;
};

export type OkfIndexSurvey = {
  /** Catalog path that was read (e.g. Memory/index.md). */
  indexPath?: string;
  /** Whether the catalog file was found. */
  indexFound: boolean;
  noteCount?: number;
  /** Top catalog matches for the query (titles/paths only — cheap). */
  catalogHits: IndexCatalogEntry[];
  /** Recent ingest lines from log.md for session continuity. */
  recentLog: RecentLogEntry[];
  /** Approximate token cost of the survey payload (catalog+log text). */
  surveyTokenEstimate: number;
};

function defaultScanRoot(): string {
  const v = process.env.CLAWQL_MEMORY_RECALL_SCAN_ROOT;
  if (v === undefined) return "Memory";
  const t = v.trim();
  return t === "" ? "" : t;
}

function okfIndexRel(scanRoot: string): string {
  const root = scanRoot.replace(/\\/g, "/").replace(/^\/+/, "");
  return root ? `${root}/index.md` : "index.md";
}

function okfLogRel(scanRoot: string): string {
  const root = scanRoot.replace(/\\/g, "/").replace(/^\/+/, "");
  return root ? `${root}/log.md` : "log.md";
}

/** Disable with CLAWQL_MEMORY_RECALL_INDEX_FIRST=0. Default on. */
export function indexFirstRecallEnabled(): boolean {
  const v = process.env.CLAWQL_MEMORY_RECALL_INDEX_FIRST?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

/**
 * When vault file count exceeds this, only load full bodies for catalog + vector
 * candidates (plus a small IDF sample). Below threshold: full scan for quality.
 * Default 48. Set CLAWQL_MEMORY_RECALL_INDEX_FIRST_THRESHOLD.
 */
export function indexFirstBodyLoadThreshold(): number {
  const v = process.env.CLAWQL_MEMORY_RECALL_INDEX_FIRST_THRESHOLD?.trim();
  if (!v) return 48;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 48;
}

const CATALOG_LINE_RE = /^\s*-\s*\[\[([^\]]+)\]\](?:\s*`\(([^)`]+)\)`)?(?:\s*[—-]\s*(.+))?/;

/**
 * Parse OKF / provider index markdown into catalog entries (path + title).
 * Exported for unit tests.
 */
export function parseOkfIndexCatalog(markdown: string): {
  entries: Omit<IndexCatalogEntry, "score">[];
  noteCount?: number;
} {
  const body = stripVaultFrontmatter(markdown);
  const entries: Omit<IndexCatalogEntry, "score">[] = [];
  let noteCount: number | undefined;
  let folder: string | undefined;

  for (const line of body.split("\n")) {
    const summaryNotes = line.match(/^\s*-\s*\*\*Notes:\*\*\s*(\d+)/i);
    if (summaryNotes) {
      noteCount = Number.parseInt(summaryNotes[1]!, 10);
      continue;
    }
    const folderMatch = line.match(/^###\s+`([^`]+)`\/?\s*$/);
    if (folderMatch) {
      folder = folderMatch[1]!.replace(/\/$/, "");
      if (folder === "(paths with no directory segment)") folder = ".";
      continue;
    }
    const m = line.match(CATALOG_LINE_RE);
    if (!m) continue;
    const title = m[1]!.trim();
    const path = m[2]?.trim();
    if (!title) continue;
    // Prefer path-bearing lines (By folder); skip A–Z title-only duplicates when path known later.
    entries.push({ title, path, folder });
  }

  // Dedupe: prefer entries with path.
  const byKey = new Map<string, Omit<IndexCatalogEntry, "score">>();
  for (const e of entries) {
    const key = (e.path ?? e.title).toLowerCase();
    const prev = byKey.get(key);
    if (!prev || (!prev.path && e.path)) byKey.set(key, e);
  }
  return { entries: [...byKey.values()], noteCount };
}

const LOG_LINE_RE =
  /^\s*-\s*\*\*([^*]+)\*\*\s*—\s*\[\[([^\]]+)\]\](?:\s*\(`([^`]+)`\))?(?:\s*type=`([^`]+)`)?/;

/**
 * Parse recent OKF log.md lines (newest first). Exported for tests.
 */
export function parseOkfRecentLog(markdown: string, maxEntries: number): RecentLogEntry[] {
  const body = stripVaultFrontmatter(markdown);
  const out: RecentLogEntry[] = [];
  for (const line of body.split("\n")) {
    const m = line.match(LOG_LINE_RE);
    if (!m) continue;
    out.push({
      timestamp: m[1]!.trim(),
      title: m[2]!.trim(),
      path: m[3]?.trim(),
      type: m[4]?.trim(),
    });
  }
  // File is chronological ascending; return newest first.
  out.reverse();
  return out.slice(0, Math.max(0, maxEntries));
}

function estimateTokens(text: string): number {
  // Rough 4 chars/token — good enough for survey economics reporting.
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Score catalog entries against a query (title + path tokens). Cheap — no body load.
 */
export function scoreCatalogEntries(
  query: string,
  entries: readonly Omit<IndexCatalogEntry, "score">[],
  limit: number
): IndexCatalogEntry[] {
  const scored = entries.map((e) => {
    const hay = `${e.title} ${e.path ?? ""} ${e.folder ?? ""}`;
    return { ...e, score: keywordScore(query, hay) };
  });
  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const hits = scored.filter((e) => e.score > 0).slice(0, limit);
  // If nothing matched tokens, still return top folder/title diversity (empty query edge).
  if (hits.length === 0 && tokenizeQuery(query).length === 0) {
    return scored.slice(0, limit).map((e) => ({ ...e, score: 0 }));
  }
  return hits;
}

export type SurveyOkfIndexInput = {
  vault: string;
  query: string;
  scanRoot?: string;
  catalogLimit?: number;
  logLimit?: number;
};

/**
 * Read index.md + log.md and produce a survey payload for memory_recall.
 */
export async function surveyOkfIndex(input: SurveyOkfIndexInput): Promise<OkfIndexSurvey> {
  const scanRoot = input.scanRoot ?? defaultScanRoot();
  const catalogLimit = input.catalogLimit ?? 12;
  const logLimit = input.logLimit ?? 8;
  const indexPath = okfIndexRel(scanRoot);
  const logPath = okfLogRel(scanRoot);

  let indexText = "";
  let indexFound = false;
  try {
    indexText = await readVaultTextFile(input.vault, indexPath);
    indexFound = true;
  } catch {
    // Try legacy _INDEX_* under scan root — best-effort.
    try {
      const { listVaultMarkdownRelPaths } = await import("../vault/slug-index.js");
      const files = await listVaultMarkdownRelPaths(input.vault, scanRoot, 50);
      const legacy = files.find((f) => basename(f).startsWith("_INDEX_") && f.endsWith(".md"));
      if (legacy) {
        indexText = await readVaultTextFile(input.vault, legacy);
        indexFound = true;
      }
    } catch {
      /* none */
    }
  }

  let logText = "";
  try {
    logText = await readVaultTextFile(input.vault, logPath);
  } catch {
    /* optional */
  }

  const parsed = indexFound
    ? parseOkfIndexCatalog(indexText)
    : { entries: [], noteCount: undefined };
  const catalogHits = scoreCatalogEntries(input.query, parsed.entries, catalogLimit);
  const recentLog = logText ? parseOkfRecentLog(logText, logLimit) : [];

  const pathCount = parsed.entries.filter((e) => e.path).length;
  return {
    indexPath: indexFound ? indexPath : undefined,
    indexFound,
    noteCount: parsed.noteCount ?? (pathCount > 0 ? pathCount : undefined),
    catalogHits,
    recentLog,
    surveyTokenEstimate: estimateTokens(indexText) + estimateTokens(logText),
  };
}

/**
 * Paths to prefer for full-body load from an index survey (catalog hits with paths).
 */
export function catalogCandidatePaths(survey: OkfIndexSurvey, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const h of survey.catalogHits) {
    if (!h.path) continue;
    const p = h.path.replace(/\\/g, "/");
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= limit) break;
  }
  for (const e of survey.recentLog) {
    if (!e.path) continue;
    const p = e.path.replace(/\\/g, "/");
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}
