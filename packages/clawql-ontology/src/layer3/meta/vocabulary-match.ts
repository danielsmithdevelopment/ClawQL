/**
 * Ontology Layer 3 vocabulary preference via Fast Decision (§2.3 / §3.3).
 * Prefers provider `preferredVocabulary` terms over novel project-local names.
 */

import { Effect } from "effect";
import {
  runFastDecision,
  WormAuditSink,
  type FastDecisionContext,
  type FastDecisionResult,
  type PreferredVocabularyId,
} from "clawql-core";

export type VocabularyTermCandidate = {
  readonly termId: string;
  readonly label: string;
  readonly vocabulary: PreferredVocabularyId;
  readonly priorConfidence?: number;
};

export type VocabularyMatchOutcome =
  | {
      readonly kind: "standard_term";
      readonly termId: string;
      readonly vocabulary: PreferredVocabularyId;
      readonly confidence: number;
      readonly decision: FastDecisionResult;
    }
  | {
      readonly kind: "novel_field_fallback";
      readonly proposedFieldName: string;
      readonly decision: FastDecisionResult;
    };

/**
 * When Layer 3 is about to mint a field, score standard vocabulary terms first.
 * Below-threshold → novel project-local field name (caller supplies proposal).
 */
export function matchOntologyVocabularyTerm(
  ctx: FastDecisionContext,
  candidates: readonly VocabularyTermCandidate[],
  preferredVocabulary: PreferredVocabularyId | undefined,
  novelFieldName: string
): Effect.Effect<
  VocabularyMatchOutcome,
  never,
  | import("clawql-core").FastDecisionRegistry
  | import("clawql-core").FastDecisionScorer
  | import("clawql-core").FastDecisionThresholdPolicyService
  | WormAuditSink
> {
  return Effect.gen(function* () {
    const worm = yield* WormAuditSink;
    const ranked = [...candidates].sort((a, b) => {
      // Prefer matching the provider's declared vocabulary.
      const aPref = preferredVocabulary && a.vocabulary === preferredVocabulary ? 1 : 0;
      const bPref = preferredVocabulary && b.vocabulary === preferredVocabulary ? 1 : 0;
      return bPref - aPref;
    });

    const enriched: FastDecisionContext = {
      ...ctx,
      extras: {
        ...ctx.extras,
        vocabularyTermCandidates: ranked.map((c) => ({
          candidateId: c.termId,
          features: {
            label: c.label,
            vocabulary: c.vocabulary,
            preferredVocabulary,
            priorConfidence:
              c.priorConfidence ??
              (preferredVocabulary && c.vocabulary === preferredVocabulary ? 0.8 : 0.55),
          },
        })),
      },
    };

    const decision = yield* runFastDecision("ontology_vocabulary_term_match", enriched).pipe(
      Effect.catchTag("FastDecisionUseSiteNotFoundError", () =>
        Effect.succeed({
          useSiteId: "ontology_vocabulary_term_match",
          candidatesScored: 0,
          scores: [],
          thresholdApplied: 0.7,
          costlyErrorDirection: "false_positive" as const,
          outcome: "below_threshold_fallback" as const,
        })
      )
    );

    if (decision.outcome === "above_threshold" && decision.selectedCandidateId) {
      const match = ranked.find((c) => c.termId === decision.selectedCandidateId);
      yield* worm.append({
        type: "ONTOLOGY_STANDARD_TERM_USED",
        useSiteId: "ontology_vocabulary_term_match",
        sessionId: ctx.sessionId,
        term: decision.selectedCandidateId,
        preferredVocabulary,
        timestamp: new Date().toISOString(),
      });
      return {
        kind: "standard_term" as const,
        termId: decision.selectedCandidateId,
        vocabulary: match?.vocabulary ?? preferredVocabulary ?? "project-local",
        confidence: decision.selectedConfidence ?? 0,
        decision,
      };
    }

    yield* worm.append({
      type: "ONTOLOGY_NOVEL_FIELD_FALLBACK",
      useSiteId: "ontology_vocabulary_term_match",
      sessionId: ctx.sessionId,
      fieldName: novelFieldName,
      preferredVocabulary,
      timestamp: new Date().toISOString(),
    });

    return {
      kind: "novel_field_fallback" as const,
      proposedFieldName: novelFieldName,
      decision,
    };
  });
}
