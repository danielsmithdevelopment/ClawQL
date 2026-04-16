/**
 * memory_recall MCP tool — keyword search + wikilink graph traversal in the vault.
 * Lightweight (no embeddings); suitable for agent loops.
 */

import { getObsidianVaultPath } from "./vault-config.js";
import { readVaultTextFile } from "./vault-utils.js";
import { slugifyTitle } from "./memory-ingest.js";
import {
  loadChunkEmbeddingsForDocuments,
  loadWikilinkEdgesFromDatabase,
  memoryDbSyncEnabled,
  recallSyncDbEnabled,
  syncMemoryDbFromDocuments,
} from "./memory-db.js";
import {
  embedQuery,
  rankDocumentsByChunkSimilarity,
  resolveEmbeddingConfig,
  vectorSqliteBackendEnabled,
} from "./memory-embedding.js";
import { listVaultMarkdownRelPaths, buildSlugToVaultPath } from "./memory-slug-index.js";
import { extractWikilinkTargets, stripVaultFrontmatter } from "./vault-markdown.js";

/** Re-export for tests and callers that imported from this module. */
export { extractWikilinkTargets } from "./vault-markdown.js";

export type MemoryRecallInput = {
  query: string;
  /** Max notes to return (default from CLAWQL_MEMORY_RECALL_LIMIT). */
  limit?: number;
  /** Wikilink hops from keyword hits (default from CLAWQL_MEMORY_RECALL_MAX_DEPTH). */
  maxDepth?: number;
  /** Minimum keyword score to seed recall (default from CLAWQL_MEMORY_RECALL_MIN_SCORE). */
  minScore?: number;
};

export type RecallHit = {
  path: string;
  score: number;
  depth: number;
  reason: "keyword" | "link" | "vector";
  linkFrom?: string;
  snippet: string;
};

export type MemoryRecallResult = {
  ok: boolean;
  query?: string;
  results?: RecallHit[];
  truncated?: boolean;
  scannedFiles?: number;
  error?: string;
};

function envInt(key: string, def: number): number {
  const v = process.env[key]?.trim();
  if (!v) return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function envFloat(key: string, def: number): number {
  const v = process.env[key]?.trim();
  if (!v) return def;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : def;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function countOccurrences(hay: string, needle: string): number {
  if (needle.length < 2) return 0;
  let c = 0;
  let i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) {
    c++;
    i += needle.length;
  }
  return c;
}

/** Exported for tests. */
export function keywordScore(query: string, text: string): number {
  const terms = tokenize(query);
  if (terms.length === 0) return 0;
  const lower = text.toLowerCase();
  let s = 0;
  for (const t of terms) {
    s += Math.min(countOccurrences(lower, t), 25);
  }
  return s;
}

function buildSnippet(text: string, query: string, maxLen: number): string {
  const body = stripVaultFrontmatter(text);
  const terms = tokenize(query);
  const lower = body.toLowerCase();
  let pos = 0;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i !== -1) {
      pos = Math.max(0, i - Math.floor(maxLen / 4));
      break;
    }
  }
  const slice = body.slice(pos, pos + maxLen).trim();
  return slice.length < body.length ? `${slice}…` : slice;
}

function defaultScanRoot(): string {
  const v = process.env.CLAWQL_MEMORY_RECALL_SCAN_ROOT;
  if (v === undefined) return "Memory";
  const t = v.trim();
  return t === "" ? "" : t;
}

export async function runMemoryRecall(input: MemoryRecallInput): Promise<MemoryRecallResult> {
  const vault = getObsidianVaultPath();
  if (!vault) {
    return {
      ok: false,
      error:
        "Obsidian vault is not configured. Set CLAWQL_OBSIDIAN_VAULT_PATH to a writable directory.",
    };
  }

  const query = input.query?.trim();
  if (!query) {
    return { ok: false, error: "query is required" };
  }

  const limit = input.limit !== undefined ? input.limit : envInt("CLAWQL_MEMORY_RECALL_LIMIT", 10);
  const maxDepth =
    input.maxDepth !== undefined ? input.maxDepth : envInt("CLAWQL_MEMORY_RECALL_MAX_DEPTH", 2);
  const minScore =
    input.minScore !== undefined ? input.minScore : envInt("CLAWQL_MEMORY_RECALL_MIN_SCORE", 1);
  const maxFiles = envInt("CLAWQL_MEMORY_RECALL_MAX_FILES", 2000);
  const snippetChars = envInt("CLAWQL_MEMORY_RECALL_SNIPPET_CHARS", 520);
  const scanRoot = defaultScanRoot();

  let mdFiles: string[];
  try {
    mdFiles = await listVaultMarkdownRelPaths(vault, scanRoot, maxFiles);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Cannot scan vault: ${msg}` };
  }

  const truncated = mdFiles.length >= maxFiles;

  type FileInfo = { rel: string; text: string; score: number };
  const files: FileInfo[] = [];
  for (const rel of mdFiles) {
    try {
      const text = await readVaultTextFile(vault, rel);
      const score = keywordScore(query, text);
      files.push({ rel, text, score });
    } catch {
      /* skip unreadable */
    }
  }

  const now = Date.now();
  if (recallSyncDbEnabled()) {
    try {
      await syncMemoryDbFromDocuments(
        vault,
        files.map((f) => ({ path: f.rel, text: f.text, mtimeMs: now }))
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[clawql-mcp] memory.db sync on recall failed: ${msg}`);
    }
  }

  const slugToPath = buildSlugToVaultPath(files.map((f) => ({ path: f.rel, text: f.text })));

  const forward = new Map<string, Set<string>>();
  const back = new Map<string, Set<string>>();
  function addEdge(a: string, b: string): void {
    if (a === b) return;
    if (!forward.has(a)) forward.set(a, new Set());
    forward.get(a)!.add(b);
    if (!back.has(b)) back.set(b, new Set());
    back.get(b)!.add(a);
  }

  for (const { rel, text } of files) {
    for (const target of extractWikilinkTargets(text)) {
      const slug = slugifyTitle(target);
      const dest = slugToPath.get(slug);
      if (dest) addEdge(rel, dest);
    }
  }

  const textByRel = new Map(files.map((f) => [f.rel, f.text]));
  if (memoryDbSyncEnabled() && files.length > 0) {
    try {
      const extra = await loadWikilinkEdgesFromDatabase(
        vault,
        files.map((f) => f.rel)
      );
      for (const e of extra) {
        if (textByRel.has(e.toPath)) addEdge(e.fromPath, e.toPath);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[clawql-mcp] memory.db wikilink merge failed: ${msg}`);
    }
  }

  function neighbors(p: string): string[] {
    const a = [...(forward.get(p) ?? [])];
    const b = [...(back.get(p) ?? [])];
    return [...new Set([...a, ...b])];
  }

  const vectorByRel = new Map<string, number>();
  if (vectorSqliteBackendEnabled() && memoryDbSyncEnabled()) {
    const embCfg = resolveEmbeddingConfig();
    if (embCfg) {
      try {
        const qEmb = await embedQuery(query, embCfg);
        if (qEmb.length > 0) {
          const chunks = await loadChunkEmbeddingsForDocuments(vault, mdFiles);
          if (chunks.length > 0) {
            const topChunks = envInt("CLAWQL_MEMORY_VECTOR_TOP_CHUNKS", 80);
            const maxDocs = envInt("CLAWQL_MEMORY_VECTOR_MAX_DOCS", 12);
            const ranked = rankDocumentsByChunkSimilarity(qEmb, chunks, {
              topChunks,
              maxDocs,
            });
            for (const r of ranked) {
              vectorByRel.set(r.path, r.score);
            }
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[clawql-mcp] memory_recall vector pass failed: ${msg}`);
      }
    }
  }

  const vectorBoost = envFloat("CLAWQL_MEMORY_VECTOR_SCORE_BOOST", 50);
  const minVectorSim = envFloat("CLAWQL_MEMORY_VECTOR_MIN_SIM", 0.28);
  const scoreByRel = new Map<string, number>();
  for (const f of files) {
    const vs = vectorByRel.get(f.rel) ?? 0;
    scoreByRel.set(f.rel, Math.max(f.score, vs * vectorBoost));
  }
  for (const [p, sim] of vectorByRel) {
    if (!scoreByRel.has(p)) scoreByRel.set(p, sim * vectorBoost);
  }

  const seedSet = new Set<string>();
  for (const f of files) {
    if (f.score >= minScore) seedSet.add(f.rel);
  }
  for (const [p, sim] of vectorByRel) {
    if (sim >= minVectorSim) seedSet.add(p);
  }
  const seeds = [...seedSet].sort(
    (a, b) => (scoreByRel.get(b) ?? 0) - (scoreByRel.get(a) ?? 0)
  );

  type Q = { rel: string; depth: number; reason: "keyword" | "link" | "vector"; from?: string };
  const queue: Q[] = [];
  const seen = new Set<string>();

  for (const s of seeds) {
    if (!seen.has(s)) {
      const kw = files.find((x) => x.rel === s);
      const kwOk = (kw?.score ?? 0) >= minScore;
      queue.push({
        rel: s,
        depth: 0,
        reason: kwOk ? "keyword" : "vector",
      });
      seen.add(s);
    }
  }

  const hits: RecallHit[] = [];
  while (queue.length > 0 && hits.length < limit) {
    const cur = queue.shift()!;
    const t = textByRel.get(cur.rel);
    if (!t) continue;

    hits.push({
      path: cur.rel,
      score: scoreByRel.get(cur.rel) ?? 0,
      depth: cur.depth,
      reason: cur.reason,
      linkFrom: cur.from,
      snippet: buildSnippet(t, query, snippetChars),
    });

    if (cur.depth >= maxDepth) continue;

    for (const n of neighbors(cur.rel)) {
      if (seen.has(n)) continue;
      seen.add(n);
      queue.push({
        rel: n,
        depth: cur.depth + 1,
        reason: "link",
        from: cur.rel,
      });
    }
  }

  hits.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    return b.score - a.score;
  });

  return {
    ok: true,
    query,
    results: hits.slice(0, limit),
    truncated,
    scannedFiles: files.length,
  };
}

export async function handleMemoryRecallToolInput(
  params: MemoryRecallInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  const result = await runMemoryRecall(params);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
