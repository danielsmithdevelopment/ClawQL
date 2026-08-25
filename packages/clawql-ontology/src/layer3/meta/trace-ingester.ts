/**
 * Layer 3 — ingest OBT/RTP traces into the meta-ontology store.
 * Spec: docs/specs/ontology/meta-ontology-v0.1.md §5.2
 */
import { Effect } from "effect";
import { readOntologyMetaConfig } from "../../effect/ontology-meta-config.js";
import { OntologyError } from "../../effect/ontology-errors.js";
import { MetaOntologyStoreService } from "./store.js";
import type {
  FieldObservation,
  OBTRecord,
  OntologyEvidence,
  QueryObservation,
} from "./types.js";

function didContributeToPass(passRate: number): boolean {
  return passRate >= 0.5;
}

export function extractOntologyEvidence(obt: OBTRecord): OntologyEvidence {
  const entityObservations = [];
  const fieldObservations: FieldObservation[] = [];
  const queryObservations: QueryObservation[] = [];
  const passRate = obt.verdict?.criterionPassRate ?? 0;
  const documentType = obt.taskMeta?.documentType;

  if (obt.taskMeta?.scaffoldedEntity && documentType) {
    entityObservations.push({
      entityId: obt.taskMeta.scaffoldedEntity.id,
      documentType,
      entity: obt.taskMeta.scaffoldedEntity,
      criterionPassRate: passRate,
    });
  }

  for (const turn of obt.rtp?.turnSequence ?? []) {
    if (turn.execution?.toolName !== "memory_recall") continue;
    const args = turn.execution.payload ?? {};
    const result = turn.execution.result;
    const schema = typeof args.schema === "string" ? args.schema : undefined;
    const filters =
      args.filters && typeof args.filters === "object"
        ? (args.filters as Record<string, unknown>)
        : undefined;

    if (schema && filters) {
      queryObservations.push({
        entityId: schema,
        filters,
        resultCount: result?.filteredEntities ?? result?.hits?.length ?? 0,
        queryType: result?.queryType,
        contributed: didContributeToPass(passRate),
        criterionPassRate: passRate,
        goal: "enumerate_all",
      });
    }

    if (result?.hits && schema) {
      for (const hit of result.hits) {
        for (const [field, value] of Object.entries(hit.fields ?? {})) {
          fieldObservations.push({
            entityId: schema,
            fieldName: field,
            wasNull: value === null || value === undefined,
            wasExtracted: hit.confidence === "EXTRACTED",
            documentType,
            contributedToPass: didContributeToPass(passRate),
          });
        }
      }
    }
  }

  return { entityObservations, fieldObservations, queryObservations };
}

export function ingestOBTTrace(
  obt: OBTRecord
): Effect.Effect<void, OntologyError, MetaOntologyStoreService> {
  return Effect.gen(function* () {
    const cfg = yield* readOntologyMetaConfig();
    if (!cfg.metaEnabled) return;

    const store = yield* MetaOntologyStoreService;
    const passRate = obt.verdict?.criterionPassRate ?? 0;

    if (!obt.verdict || passRate < 0.5) {
      if (cfg.learnFailures) {
        yield* store.learnFailurePattern(obt);
      }
      return;
    }

    const evidence = extractOntologyEvidence(obt);
    for (const entityObservation of evidence.entityObservations) {
      yield* store.updateEntity(entityObservation);
    }
    for (const fieldObservation of evidence.fieldObservations) {
      yield* store.updateFieldReliability(fieldObservation);
    }
    for (const queryObservation of evidence.queryObservations) {
      yield* store.updateQueryPattern(queryObservation);
    }
  });
}
