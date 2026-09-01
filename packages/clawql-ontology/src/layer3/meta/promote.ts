/**
 * Layer 3 → Layer 1 promotion candidates.
 * Spec: docs/specs/ontology/meta-ontology-v0.1.md §7
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { readOntologyMetaConfig } from "../../effect/ontology-meta-config.js";
import { OntologyError, ontologyFail, ontologyFromPromise } from "../../effect/ontology-errors.js";
import { cqeEntityToYaml } from "../../shared/cqe-to-yaml.js";
import type { CQEEntity, PromotionCandidate } from "../../shared/cqe-runtime-types.js";
import { MetaOntologyStoreService } from "./store.js";

export function checkPromotionCandidates(): Effect.Effect<
  PromotionCandidate[],
  OntologyError,
  MetaOntologyStoreService
> {
  return Effect.gen(function* () {
    const cfg = yield* readOntologyMetaConfig();
    const store = yield* MetaOntologyStoreService;
    const rows = yield* store.listLearnedEntities();
    return rows
      .filter(
        (r) =>
          r.evidence_count >= cfg.promotionEvidence &&
          r.avg_criterion_pass_rate >= cfg.promotionQuality &&
          r.promoted_to_layer1 === 0
      )
      .map((c) => {
        const entity = JSON.parse(c.entity_json) as CQEEntity;
        return {
          documentType: c.document_type,
          entity,
          evidenceCount: c.evidence_count,
          avgCriterionPassRate: c.avg_criterion_pass_rate,
          suggestedCQEPath: `packs/${c.document_type}/entities/entity.cqe`,
        } satisfies PromotionCandidate;
      })
      .sort((a, b) => b.avgCriterionPassRate - a.avgCriterionPassRate);
  });
}

export type PromoteResult = {
  documentType: string;
  outputPath: string;
  yaml: string;
  candidate: PromotionCandidate;
};

export function promoteDocumentType(
  documentType: string,
  outputDir: string
): Effect.Effect<PromoteResult, OntologyError, MetaOntologyStoreService> {
  return Effect.gen(function* () {
    const store = yield* MetaOntologyStoreService;
    const candidates = yield* checkPromotionCandidates();
    let candidate = candidates.find((c) => c.documentType === documentType);

    if (!candidate) {
      const learned = yield* store.getLearnedEntity(documentType);
      if (!learned) {
        return yield* ontologyFail(`No learned entity for document type: ${documentType}`);
      }
      candidate = {
        documentType,
        entity: JSON.parse(learned.entity_json) as CQEEntity,
        evidenceCount: learned.evidence_count,
        avgCriterionPassRate: learned.avg_criterion_pass_rate,
        suggestedCQEPath: `packs/${documentType}/entities/entity.cqe`,
      };
    }

    const yaml = yield* cqeEntityToYaml(candidate.entity);
    const entitiesDir = join(outputDir, "entities");
    const outputPath = join(entitiesDir, "entity.cqe");
    yield* ontologyFromPromise(async () => {
      await mkdir(entitiesDir, { recursive: true });
      await writeFile(outputPath, yaml, "utf8");
    });
    yield* store.markPromoted(documentType);
    return { documentType, outputPath, yaml, candidate };
  });
}
