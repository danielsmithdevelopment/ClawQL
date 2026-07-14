import { Cause, Effect, Exit } from "effect";
import { readVaultTextFile } from "../vault/utils.js";
import { slugifyTitle } from "../ingest/slug.js";
import { listVaultMarkdownRelPaths, buildSlugToVaultPath } from "../vault/slug-index.js";
import { extractWikilinkTargets, stripVaultFrontmatter } from "../vault/markdown.js";
import {
  keywordScore,
  mapVaultResultToNormalizedHit,
  resolveMemoryRecallSources,
  type MemoryRecallInput,
  type MemoryRecallResult,
  type MemoryRecallSource,
  type NormalizedRecallHit,
  type RecallFollowUpHint,
  type RecallHit,
} from "../recall/recall.js";
import { MemoryError } from "./memory-errors.js";
import { EmbeddingService } from "./embedding-service.js";
import { MemoryDbService } from "./memory-db-service.js";
import { memoryFromPromise } from "./memory-effect-utils.js";
import { VaultConfigService } from "./vault-config-service.js";
import type { RecallDbArtifacts } from "../db/memory-db.js";
import {
  recallMerkleSnapshotEffect,
  recallSyncDocumentsOnScanEffect,
  recallVectorPassEffect,
  recallWikilinkEdgesEffect,
} from "./memory-recall-vector-effect.js";
import {
  hybridCodeGraphRecallEnabled,
  recallCodeGraphSupplementPack,
  type CodeGraphRecallHit,
} from "../recall/codegraph-recall.js";
import { recallPageIndexSupplement } from "../recall/pageindex-recall.js";
import { recallOnyxSupplement } from "../recall/onyx-recall.js";

const VAULT_NOT_CONFIGURED =
  "Obsidian vault is not configured. Set CLAWQL_OBSIDIAN_VAULT_PATH to a writable directory.";

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

function defaultScanRoot(): string {
  const v = process.env.CLAWQL_MEMORY_RECALL_SCAN_ROOT;
  if (v === undefined) return "Memory";
  const t = v.trim();
  return t === "" ? "" : t;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
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

function dedupeFollowUps(hints: RecallFollowUpHint[]): RecallFollowUpHint[] {
  const seen = new Set<string>();
  const out: RecallFollowUpHint[] = [];
  for (const h of hints) {
    const key = `${h.tool}:${JSON.stringify(h.args ?? {})}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

export type MemoryRecallServices = EmbeddingService | MemoryDbService;

/** Full recall body as Effect.gen — db/embedding via infrastructure services. */
export function executeMemoryRecallCoreEffect(
  vault: string,
  input: MemoryRecallInput
): Effect.Effect<MemoryRecallResult, MemoryError, MemoryRecallServices> {
  return Effect.gen(function* () {
    yield* memoryFromPromise(async () => {
      const { runBeforeRecallVaultSync } = await import("../sync/vault-sync-hooks.js");
      await runBeforeRecallVaultSync();
    });

    const query = input.query?.trim();
    if (!query) {
      return { ok: false, error: "query is required" };
    }

    const sources = resolveMemoryRecallSources({
      sources: input.sources,
      includeCodeGraph: input.includeCodeGraph,
      hybridCodeGraphEnabled: hybridCodeGraphRecallEnabled(),
    });
    const sourcesUsed = [...sources];
    const sourceNotes: Partial<Record<MemoryRecallSource, string>> = {};
    const normalizedHits: NormalizedRecallHit[] = [];
    const followUps: RecallFollowUpHint[] = [];

    const wantVault = sources.has("vault");
    const wantVector = sources.has("vector");
    const wantCodeGraph = sources.has("codegraph");
    const wantPageIndex = sources.has("pageindex");
    const wantOnyx = sources.has("onyx");

    const limit =
      input.limit !== undefined ? input.limit : envInt("CLAWQL_MEMORY_RECALL_LIMIT", 10);
    const maxDepth =
      input.maxDepth !== undefined ? input.maxDepth : envInt("CLAWQL_MEMORY_RECALL_MAX_DEPTH", 2);
    const minScore =
      input.minScore !== undefined ? input.minScore : envInt("CLAWQL_MEMORY_RECALL_MIN_SCORE", 1);
    const maxFiles = envInt("CLAWQL_MEMORY_RECALL_MAX_FILES", 2000);
    const snippetChars = envInt("CLAWQL_MEMORY_RECALL_SNIPPET_CHARS", 520);
    const topChunks = envInt("CLAWQL_MEMORY_VECTOR_TOP_CHUNKS", 80);
    const maxDocs = envInt("CLAWQL_MEMORY_VECTOR_MAX_DOCS", 12);
    const scanRoot = defaultScanRoot();

    let truncated = false;
    let scannedFiles = 0;
    let vaultHits: RecallHit[] = [];
    let cuckooVectorChunksDropped: number | undefined;
    let recallArtifacts: RecallDbArtifacts | null = null;
    let codeGraphHits: CodeGraphRecallHit[] | undefined;

    if (wantVault || wantVector) {
      const scanExit = yield* Effect.exit(
        memoryFromPromise(() => listVaultMarkdownRelPaths(vault, scanRoot, maxFiles))
      );
      if (Exit.isFailure(scanExit)) {
        const reason = Cause.squash(scanExit.cause);
        const msg = reason instanceof Error ? reason.message : String(reason);
        return { ok: false, error: `Cannot scan vault: ${msg}`, sourcesUsed };
      }
      const mdFiles = scanExit.value;
      truncated = mdFiles.length >= maxFiles;

      type FileInfo = { rel: string; text: string; score: number };
      const files: FileInfo[] = [];
      for (const rel of mdFiles) {
        const text = yield* memoryFromPromise(() => readVaultTextFile(vault, rel)).pipe(
          Effect.catchAll(() => Effect.succeed(undefined))
        );
        if (text === undefined) continue;
        files.push({
          rel,
          text,
          score: wantVault ? keywordScore(query, text) : 0,
        });
      }
      scannedFiles = files.length;

      const now = Date.now();
      yield* recallSyncDocumentsOnScanEffect(
        vault,
        files.map((f) => ({ path: f.rel, text: f.text, mtimeMs: now }))
      );

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

      if (wantVault) {
        for (const { rel, text } of files) {
          for (const target of extractWikilinkTargets(text)) {
            const slug = slugifyTitle(target);
            const dest = slugToPath.get(slug);
            if (dest) addEdge(rel, dest);
          }
        }
      }

      const textByRel = new Map(files.map((f) => [f.rel, f.text]));
      if (wantVault) {
        const extraEdges = yield* recallWikilinkEdgesEffect(
          vault,
          files.map((f) => f.rel)
        );
        for (const e of extraEdges) {
          if (textByRel.has(e.toPath)) addEdge(e.fromPath, e.toPath);
        }
      }

      function neighbors(p: string): string[] {
        const a = [...(forward.get(p) ?? [])];
        const b = [...(back.get(p) ?? [])];
        return [...new Set([...a, ...b])];
      }

      let vectorByRel = new Map<string, number>();
      if (wantVector) {
        const vectorPass = yield* recallVectorPassEffect({
          vault,
          query,
          mdFiles,
          topChunks,
          maxDocs,
        });
        vectorByRel = vectorPass.vectorByRel;
        cuckooVectorChunksDropped = vectorPass.cuckooVectorChunksDropped;
        recallArtifacts = vectorPass.recallArtifacts;
        if (vectorByRel.size === 0) {
          sourceNotes.vector = "No vector hits (backend off, missing embeddings, or empty index)";
        }
      } else {
        sourceNotes.vector = "vector source not requested";
      }

      const vectorBoost = envFloat("CLAWQL_MEMORY_VECTOR_SCORE_BOOST", 50);
      const minVectorSim = envFloat("CLAWQL_MEMORY_VECTOR_MIN_SIM", 0.28);
      const scoreByRel = new Map<string, number>();
      for (const f of files) {
        const vs = wantVector ? (vectorByRel.get(f.rel) ?? 0) : 0;
        const kw = wantVault ? f.score : 0;
        scoreByRel.set(f.rel, Math.max(kw, vs * vectorBoost));
      }
      if (wantVector) {
        for (const [p, sim] of vectorByRel) {
          if (!scoreByRel.has(p)) scoreByRel.set(p, sim * vectorBoost);
        }
      }

      const seedSet = new Set<string>();
      if (wantVault) {
        for (const f of files) {
          if (f.score >= minScore) seedSet.add(f.rel);
        }
      }
      if (wantVector) {
        for (const [p, sim] of vectorByRel) {
          if (sim >= minVectorSim) seedSet.add(p);
        }
      }
      const seeds = [...seedSet].sort((a, b) => (scoreByRel.get(b) ?? 0) - (scoreByRel.get(a) ?? 0));

      type Q = { rel: string; depth: number; reason: "keyword" | "link" | "vector"; from?: string };
      const queue: Q[] = [];
      const seen = new Set<string>();

      for (const s of seeds) {
        if (!seen.has(s)) {
          const kw = files.find((x) => x.rel === s);
          const kwOk = wantVault && (kw?.score ?? 0) >= minScore;
          queue.push({
            rel: s,
            depth: 0,
            reason: kwOk ? "keyword" : "vector",
          });
          seen.add(s);
        }
      }

      const hits: RecallHit[] = [];
      const bfsDepth = wantVault ? maxDepth : 0;
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

        if (!wantVault || cur.depth >= bfsDepth) continue;

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
      vaultHits = hits.slice(0, limit);
      for (const h of vaultHits) {
        normalizedHits.push(mapVaultResultToNormalizedHit(h));
      }
    } else {
      sourceNotes.vault = "vault source not requested";
    }

    if (wantCodeGraph) {
      const pack = yield* memoryFromPromise(() =>
        recallCodeGraphSupplementPack({
          query,
          graphId: input.codeGraphId,
          limit: envInt("CLAWQL_MEMORY_RECALL_CODEGRAPH_LIMIT", 8),
          force: true,
        })
      );
      if (pack.skipped) sourceNotes.codegraph = pack.skipped;
      if (pack.codeGraphHits.length > 0) codeGraphHits = pack.codeGraphHits;
      normalizedHits.push(...pack.hits);
      followUps.push(...pack.followUps);
    }

    if (wantPageIndex) {
      const pi = yield* memoryFromPromise(() =>
        recallPageIndexSupplement({
          query,
          limit: envInt("CLAWQL_MEMORY_RECALL_PAGEINDEX_LIMIT", 8),
        })
      );
      if (pi.skipped) sourceNotes.pageindex = pi.skipped;
      normalizedHits.push(...pi.hits);
      followUps.push(...pi.followUps);
    }

    if (wantOnyx) {
      const ox = yield* memoryFromPromise(() =>
        recallOnyxSupplement({
          query,
          limit: envInt("CLAWQL_MEMORY_RECALL_ONYX_LIMIT", 8),
        })
      );
      if (ox.skipped) sourceNotes.onyx = ox.skipped;
      normalizedHits.push(...ox.hits);
      followUps.push(...ox.followUps);
    }

    normalizedHits.sort((a, b) => b.score - a.score);

    const result: MemoryRecallResult = {
      ok: true,
      query,
      results: vaultHits,
      hits: normalizedHits,
      followUps: followUps.length > 0 ? dedupeFollowUps(followUps) : undefined,
      sourcesUsed,
      sourceNotes: Object.keys(sourceNotes).length > 0 ? sourceNotes : undefined,
      truncated: wantVault || wantVector ? truncated : undefined,
      scannedFiles: wantVault || wantVector ? scannedFiles : undefined,
    };

    if (codeGraphHits) {
      result.codeGraphHits = codeGraphHits;
    }

    if (wantVault || wantVector) {
      const merkleSnapshot = yield* recallMerkleSnapshotEffect(vault, recallArtifacts);
      if (merkleSnapshot !== undefined) {
        result.merkleSnapshot = merkleSnapshot;
      }
      if (cuckooVectorChunksDropped !== undefined) {
        result.cuckooVectorChunksDropped = cuckooVectorChunksDropped;
      }
    }

    return result;
  });
}

/** Recall pipeline as Effect.gen — vault path via {@link VaultConfigService}. */
export function executeMemoryRecallEffect(
  input: MemoryRecallInput
): Effect.Effect<MemoryRecallResult, MemoryError, VaultConfigService | MemoryRecallServices> {
  return Effect.gen(function* () {
    const vaultConfig = yield* VaultConfigService;
    const vault = vaultConfig.getObsidianVaultPath();
    if (!vault) {
      return { ok: false, error: VAULT_NOT_CONFIGURED };
    }
    return yield* executeMemoryRecallCoreEffect(vault, input);
  });
}
