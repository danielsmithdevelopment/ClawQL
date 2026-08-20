import { Cause, Effect, Exit } from "effect";
import { readVaultTextFile } from "../vault/utils.js";
import { slugifyTitle } from "../ingest/slug.js";
import { listVaultMarkdownRelPaths, buildSlugToVaultPath } from "../vault/slug-index.js";
import { extractWikilinkTargets, stripVaultFrontmatter } from "../vault/markdown.js";
import { isOkfRetracted, isOkfStale, parseVaultFrontmatter } from "../okf/frontmatter.js";
import {
  buildCorpusIdf,
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
import {
  catalogCandidatePaths,
  indexFirstBodyLoadThreshold,
  indexFirstRecallEnabled,
  surveyOkfIndex,
  type OkfIndexSurvey,
} from "../recall/index-survey.js";
import { rerankNormalizedHitsRrf } from "../recall/hybrid-rerank.js";

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

    // Structured ontology path — exact predicate evaluation (B-7.1 / legal domain).
    if (input.schema && input.filters && Object.keys(input.filters).length > 0) {
      const ontologyResult = yield* memoryFromPromise(async () => {
        const { runOntologyRecall } = await import("../ontology/ontology-query.js");
        return runOntologyRecall(vault, {
          query,
          schema: input.schema!,
          filters: input.filters!,
          confidenceMinimum: input.confidenceMinimum,
          limit: input.limit,
        });
      });
      if (!ontologyResult.ok) {
        return {
          ok: false,
          error: ontologyResult.error,
          // Mirror CLAWQL_MEMORY_DB=0 skip shape for operators (`ontology_disabled`).
          ...(ontologyResult.errorType ? { errorType: ontologyResult.errorType } : {}),
        };
      }
      const normalizedHits = ontologyResult.hits.map((h) => ({
        source: "vault" as const,
        id: h.path,
        score: h.score,
        snippet: h.snippet,
        path: h.path,
        meta: {
          entityId: h.entityId,
          entityType: h.entityType,
          fields: h.fields,
          confidence: h.confidence,
          extractionMethod: h.extractionMethod,
        },
      }));
      return yield* memoryFromPromise(async () => {
        const base: MemoryRecallResult = {
          ok: true,
          query: ontologyResult.query,
          results: ontologyResult.results,
          hits: normalizedHits,
          sourcesUsed: ontologyResult.sourcesUsed,
          queryType: ontologyResult.queryType,
          indexUsed: ontologyResult.indexUsed,
          schema: ontologyResult.schema,
          filters: ontologyResult.filters,
          scannedEntities: ontologyResult.scannedEntities,
          filteredEntities: ontologyResult.filteredEntities,
          confidenceMinimum: ontologyResult.confidenceMinimum,
          scannedFiles: ontologyResult.scannedEntities,
        };
        const { maybeEnrichHarveyLabRecall } = await import("../recall/harvey-lab-enrich.js");
        return maybeEnrichHarveyLabRecall(base);
      });
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
      input.minScore !== undefined
        ? input.minScore
        : envFloat("CLAWQL_MEMORY_RECALL_MIN_SCORE", 0.05);
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
    let indexSurvey: OkfIndexSurvey | undefined;
    let indexFirstBodyLoad = false;
    let bodiesLoaded = 0;

    if (wantVault || wantVector) {
      const useIndexFirst = indexFirstRecallEnabled();
      if (useIndexFirst) {
        indexSurvey = yield* memoryFromPromise(() =>
          surveyOkfIndex({
            vault,
            query,
            scanRoot,
            catalogLimit: envInt("CLAWQL_MEMORY_RECALL_CATALOG_LIMIT", Math.max(limit * 2, 12)),
            logLimit: envInt("CLAWQL_MEMORY_RECALL_LOG_LIMIT", 8),
          })
        );
      }

      const scanExit = yield* Effect.exit(
        memoryFromPromise(() => listVaultMarkdownRelPaths(vault, scanRoot, maxFiles))
      );
      if (Exit.isFailure(scanExit)) {
        const reason = Cause.squash(scanExit.cause);
        const msg = reason instanceof Error ? reason.message : String(reason);
        return { ok: false, error: `Cannot scan vault: ${msg}`, sourcesUsed, indexSurvey };
      }
      const mdFiles = scanExit.value;
      truncated = mdFiles.length >= maxFiles;

      // Prefer catalog + recent-log paths for body load when vault is large.
      const catalogPaths = indexSurvey
        ? catalogCandidatePaths(
            indexSurvey,
            envInt("CLAWQL_MEMORY_RECALL_INDEX_BODY_CANDIDATES", Math.max(limit * 4, 24))
          )
        : [];
      const restrictBodies =
        useIndexFirst && mdFiles.length > indexFirstBodyLoadThreshold() && catalogPaths.length > 0;
      indexFirstBodyLoad = restrictBodies;

      // Always include index/log so catalog stays in the graph; plus catalog candidates.
      const preferLoad = new Set<string>(catalogPaths);
      for (const rel of mdFiles) {
        const base = rel.replace(/\\/g, "/").split("/").pop() ?? "";
        if (base === "index.md" || base === "log.md" || base.startsWith("_INDEX_")) {
          preferLoad.add(rel);
        }
      }

      type FileInfo = { rel: string; text: string; score: number };
      const files: FileInfo[] = [];
      const corpusTexts: string[] = [];
      for (const rel of mdFiles) {
        if (restrictBodies && !preferLoad.has(rel)) {
          // Skip full body — vector pass still sees path via mdFiles / memory.db.
          continue;
        }
        const text = yield* memoryFromPromise(() => readVaultTextFile(vault, rel)).pipe(
          Effect.catchAll(() => Effect.succeed(undefined))
        );
        if (text === undefined) continue;
        // OKF v0.2 — never surface retracted knowledge; down-weight stale/superseded.
        const fm = parseVaultFrontmatter(text);
        if (isOkfRetracted(fm)) continue;
        corpusTexts.push(text);
        files.push({ rel, text, score: 0 });
      }
      bodiesLoaded = files.length;
      scannedFiles = restrictBodies ? mdFiles.length : files.length;

      // Corpus IDF so ubiquitous tokens (shared vocabulary) do not bury distinctive matches.
      const idf = wantVault ? buildCorpusIdf(corpusTexts) : undefined;
      const catalogScoreByPath = new Map<string, number>();
      if (indexSurvey) {
        for (const h of indexSurvey.catalogHits) {
          if (!h.path) continue;
          catalogScoreByPath.set(h.path.replace(/\\/g, "/"), h.score);
        }
      }
      for (const f of files) {
        const fm = parseVaultFrontmatter(f.text);
        let score = wantVault && idf ? keywordScore(query, f.text, idf) : 0;
        if (wantVault) {
          const relNorm = f.rel.replace(/\\/g, "/");
          // Prefer OKF catalogs and ontology schema notes (essay Layer 6 / index-first recall).
          if (/(^|\/)index\.md$/i.test(relNorm)) score += 8;
          if (/ontology/i.test(relNorm) || /type:\s*["']?ontology_/i.test(f.text)) score += 5;
          // Catalog title match is a cheap relevance prior (index-first).
          const cat = catalogScoreByPath.get(relNorm);
          if (cat && cat > 0) score += cat * 2;
          if (isOkfStale(fm)) score = Math.max(0, score - 3);
        }
        f.score = score;
      }

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

      // Index-first: load any vector-hit bodies that were skipped in the restricted pass.
      if (restrictBodies && wantVector) {
        const minVectorSimLoad = envFloat("CLAWQL_MEMORY_VECTOR_MIN_SIM", 0.28);
        for (const [p, sim] of vectorByRel) {
          if (sim < minVectorSimLoad) continue;
          if (textByRel.has(p)) continue;
          const text = yield* memoryFromPromise(() => readVaultTextFile(vault, p)).pipe(
            Effect.catchAll(() => Effect.succeed(undefined))
          );
          if (text === undefined) continue;
          const fm = parseVaultFrontmatter(text);
          if (isOkfRetracted(fm)) continue;
          files.push({ rel: p, text, score: 0 });
          corpusTexts.push(text);
          textByRel.set(p, text);
        }
        // Recompute IDF + keyword scores over the expanded body set.
        if (wantVault) {
          const idf2 = buildCorpusIdf(corpusTexts);
          for (const f of files) {
            const fm = parseVaultFrontmatter(f.text);
            let score = keywordScore(query, f.text, idf2);
            const relNorm = f.rel.replace(/\\/g, "/");
            if (/(^|\/)index\.md$/i.test(relNorm)) score += 8;
            if (/ontology/i.test(relNorm) || /type:\s*["']?ontology_/i.test(f.text)) score += 5;
            if (isOkfStale(fm)) score = Math.max(0, score - 3);
            f.score = score;
          }
        }
        bodiesLoaded = files.length;
        // Rebuild slug map + edges for newly loaded bodies.
        const slug2 = buildSlugToVaultPath(files.map((f) => ({ path: f.rel, text: f.text })));
        for (const [k, v] of slug2) slugToPath.set(k, v);
        for (const { rel, text } of files) {
          for (const target of extractWikilinkTargets(text)) {
            const slug = slugifyTitle(target);
            const dest = slugToPath.get(slug);
            if (dest) addEdge(rel, dest);
          }
        }
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
      // Cap seeds so ubiquitous keyword matches cannot fill `limit` before wikilink BFS runs.
      // Without this, every reason stays "keyword" even when the graph has usable edges.
      const seedCap = envInt("CLAWQL_MEMORY_RECALL_SEED_CAP", Math.max(limit * 2, 8));
      const seeds = [...seedSet]
        .sort((a, b) => (scoreByRel.get(b) ?? 0) - (scoreByRel.get(a) ?? 0))
        .slice(0, seedCap);

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

      // Expand the full neighborhood from capped seeds before truncating to `limit`.
      // Stopping at `limit` during BFS left only keyword seeds in results (wikilink layer inert).
      const maxCandidates = envInt(
        "CLAWQL_MEMORY_RECALL_MAX_CANDIDATES",
        Math.max(limit * 8, seedCap * 3)
      );
      const bfsDepth = wantVault ? maxDepth : 0;
      const candidates: Q[] = [];
      while (queue.length > 0 && candidates.length < maxCandidates) {
        const cur = queue.shift()!;
        candidates.push(cur);

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

      const linkInherit = envFloat("CLAWQL_MEMORY_RECALL_LINK_SCORE_INHERIT", 0.35);
      const scoredHits: RecallHit[] = [];
      for (const cur of candidates) {
        const t = textByRel.get(cur.rel);
        if (!t) continue;
        let score = scoreByRel.get(cur.rel) ?? 0;
        if (cur.reason === "link" && cur.from) {
          const inherited = (scoreByRel.get(cur.from) ?? 0) * linkInherit;
          if (inherited > score) score = inherited;
        }
        scoredHits.push({
          path: cur.rel,
          score,
          depth: cur.depth,
          reason: cur.reason,
          linkFrom: cur.from,
          snippet: buildSnippet(t, query, snippetChars),
        });
      }

      // Guarantee wikilink neighbors of top seeds can surface even when many
      // weak keyword matches share ubiquitous vocabulary (measured 116-note failure).
      const primary = scoredHits
        .filter((h) => h.reason !== "link")
        .sort((a, b) => b.score - a.score || a.depth - b.depth);
      const linkHits = scoredHits
        .filter((h) => h.reason === "link")
        .sort((a, b) => b.score - a.score || a.depth - b.depth);
      const topPrimaryPaths = new Set(
        primary.slice(0, Math.max(limit, seedCap)).map((h) => h.path)
      );
      const usefulLinks = linkHits.filter((h) => h.linkFrom && topPrimaryPaths.has(h.linkFrom));
      const linkBudget = Math.min(Math.max(1, Math.floor(limit / 2)), usefulLinks.length);
      const primaryBudget = Math.max(0, limit - linkBudget);
      const merged = [...primary.slice(0, primaryBudget), ...usefulLinks.slice(0, linkBudget)];
      // Fill any remaining slots from leftover primary / links by score.
      if (merged.length < limit) {
        const used = new Set(merged.map((h) => h.path));
        const rest = [...primary, ...usefulLinks]
          .filter((h) => !used.has(h.path))
          .sort((a, b) => b.score - a.score || a.depth - b.depth);
        for (const h of rest) {
          if (merged.length >= limit) break;
          merged.push(h);
        }
      }
      vaultHits = merged.slice(0, limit);
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
    // Cross-source RRF when ≥2 source kinds contributed (incompatible score scales).
    const sourceKinds = new Set(normalizedHits.map((h) => h.source));
    const useRrf =
      sourceKinds.size >= 2 &&
      process.env.CLAWQL_MEMORY_RECALL_RRF?.trim().toLowerCase() !== "0" &&
      process.env.CLAWQL_MEMORY_RECALL_RRF?.trim().toLowerCase() !== "false";
    const rankedHits = useRrf
      ? rerankNormalizedHitsRrf(normalizedHits, {
          k: envInt("CLAWQL_MEMORY_RECALL_RRF_K", 60),
          limit: Math.max(limit * 2, normalizedHits.length),
        }).slice(0, Math.max(limit, normalizedHits.length))
      : normalizedHits;

    const result: MemoryRecallResult = {
      ok: true,
      query,
      results: vaultHits,
      hits: rankedHits,
      followUps: followUps.length > 0 ? dedupeFollowUps(followUps) : undefined,
      sourcesUsed,
      sourceNotes: Object.keys(sourceNotes).length > 0 ? sourceNotes : undefined,
      truncated: wantVault || wantVector ? truncated : undefined,
      scannedFiles: wantVault || wantVector ? scannedFiles : undefined,
      indexSurvey,
      indexFirstBodyLoad: indexFirstBodyLoad || undefined,
      bodiesLoaded: wantVault || wantVector ? bodiesLoaded : undefined,
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

    // Best-effort MEMORY_RECALL WORM event (negative-proof / audit queries).
    yield* memoryFromPromise(async () => {
      const { emitMemoryWormEvent } = await import("../okf/worm-events.js");
      await emitMemoryWormEvent({
        kind: "MEMORY_RECALL",
        at: new Date().toISOString(),
        detail: {
          query,
          paths: (result.results ?? []).map((r) => r.path),
          hitCount: (result.hits ?? result.results ?? []).length,
          sourcesUsed,
        },
      });
    }).pipe(Effect.catchAll(() => Effect.void));

    return yield* memoryFromPromise(async () => {
      const { maybeEnrichHarveyLabRecall } = await import("../recall/harvey-lab-enrich.js");
      return maybeEnrichHarveyLabRecall(result);
    });
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
