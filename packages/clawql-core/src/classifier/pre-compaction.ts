/**
 * Pre-compaction ontology/cache check (§6.7) — blocking lifecycle hook payload helpers.
 */

import { Effect } from "effect";
import { WormAuditSink, type WormAuditEvent } from "../plugin/provider-types.js";
import { runFastDecision } from "./run.js";
import { StableCacheBlockService } from "./stable-cache-block.js";
import type { FastDecisionContext } from "./types.js";

export type HistoryEntryCandidate = {
  readonly entryId: string;
  readonly toolName?: string;
  readonly summary?: string;
  /** Ontology/cache/audit enrichment — never score surface shape alone (§6.4). */
  readonly ontologyContext?: Record<string, unknown>;
  readonly cacheSnapshot?: Record<string, unknown>;
  readonly auditRefs?: readonly string[];
  /** priorConfidence for cache_this decision (load-bearing likelihood). */
  readonly loadBearingPrior?: number;
  readonly extractedFact?: string;
  readonly justification?: string;
};

export type PreCompactionCheckResult = {
  readonly checked: number;
  readonly cached: readonly string[];
  readonly skipped: readonly string[];
  readonly thresholdApplied: number;
  /** Compaction may proceed against volatile history only after this returns. */
  readonly compactionPermitted: true;
};

/**
 * Blocking pre-compaction gate: score each history entry; append load-bearing
 * facts + CoT justification to the stable cache block before pruning is allowed.
 */
export function runPreCompactionOntologyCacheCheck(
  ctx: FastDecisionContext,
  entries: readonly HistoryEntryCandidate[]
): Effect.Effect<
  PreCompactionCheckResult,
  never,
  | import("./registry.js").FastDecisionRegistry
  | import("./scorer.js").FastDecisionScorer
  | import("./threshold-policy.js").FastDecisionThresholdPolicyService
  | StableCacheBlockService
  | WormAuditSink
> {
  return Effect.gen(function* () {
    const worm = yield* WormAuditSink;
    const stable = yield* StableCacheBlockService;
    const existing = yield* stable.list();

    const enrichedCtx: FastDecisionContext = {
      ...ctx,
      extras: {
        ...ctx.extras,
        historyEntryCandidates: entries.map((e) => ({
          candidateId: e.entryId,
          features: {
            label: e.summary ?? e.toolName ?? e.entryId,
            priorConfidence: e.loadBearingPrior ?? 0.5,
            ontologyContext: e.ontologyContext ?? {},
            cacheSnapshot: e.cacheSnapshot ?? {},
            auditRefs: e.auditRefs ?? [],
            // Decision framed as cache_this vs dont_cache_this via confidence vs threshold
            decision: "cache_this",
          },
        })),
        stableCacheContents: existing,
      },
    };

    const decision = yield* runFastDecision(
      "pre_compaction_ontology_cache_check",
      enrichedCtx
    ).pipe(
      Effect.catchTag("FastDecisionUseSiteNotFoundError", () =>
        Effect.succeed({
          useSiteId: "pre_compaction_ontology_cache_check",
          candidatesScored: entries.length,
          scores: entries.map((e) => ({
            candidateId: e.entryId,
            confidence: e.loadBearingPrior ?? 0.5,
          })),
          thresholdApplied: 0.35,
          costlyErrorDirection: "false_negative" as const,
          outcome: "above_threshold" as const,
        })
      )
    );

    yield* worm.append({
      type: "PRE_COMPACTION_CACHE_CHECK_RUN",
      useSiteId: "pre_compaction_ontology_cache_check",
      sessionId: ctx.sessionId,
      agentId: ctx.agentId,
      candidatesScored: entries.length,
      thresholdApplied: decision.thresholdApplied,
      timestamp: new Date().toISOString(),
    } as WormAuditEvent);

    const cached: string[] = [];
    const skipped: string[] = [];
    const threshold = decision.thresholdApplied;
    const byId = new Map(entries.map((e) => [e.entryId, e]));

    for (const score of decision.scores) {
      if (score.confidence < threshold) {
        skipped.push(score.candidateId);
        continue;
      }
      const entry = byId.get(score.candidateId);
      const appendResult = yield* stable.append({
        id: `precompact:${score.candidateId}:${Date.now()}`,
        fact: entry?.extractedFact ?? entry?.summary ?? score.candidateId,
        justification: entry?.justification,
        sourceEntryId: score.candidateId,
        metadata: {
          confidence: score.confidence,
          toolName: entry?.toolName,
        },
      });
      if (appendResult.ok) {
        cached.push(score.candidateId);
        yield* worm.append({
          type: "PRE_COMPACTION_CACHE_ITEM_WRITTEN",
          useSiteId: "pre_compaction_ontology_cache_check",
          sessionId: ctx.sessionId,
          entryId: score.candidateId,
          cacheItemId: appendResult.item.id,
          confidence: score.confidence,
          timestamp: new Date().toISOString(),
        } as WormAuditEvent);
      } else {
        skipped.push(score.candidateId);
      }
    }

    return {
      checked: entries.length,
      cached,
      skipped,
      thresholdApplied: threshold,
      compactionPermitted: true,
    } satisfies PreCompactionCheckResult;
  });
}
