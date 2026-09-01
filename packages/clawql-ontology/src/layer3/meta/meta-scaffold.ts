/**
 * Layer 3 — scaffold using learned meta-ontology patterns (fall back to Layer 2).
 * Spec: docs/specs/ontology/meta-ontology-v0.1.md §5.4
 */
import { Effect } from "effect";
import { readOntologyMetaConfig } from "../../effect/ontology-meta-config.js";
import { OntologyError } from "../../effect/ontology-errors.js";
import { OntologyIndexService } from "../../shared/ontology-index.js";
import { scaffoldFromJsonSchema } from "../../layer2/scaffold/json-schema.js";
import type {
  CQEEntity,
  CQEField,
  JSONSchema,
  QueryGoal,
  QueryPattern,
  ScaffoldOptions,
  ScaffoldResult,
} from "../../shared/cqe-runtime-types.js";
import { MetaOntologyStoreService } from "./store.js";

const DEFAULT_QUERY_STRATEGIES: Record<QueryGoal, QueryPattern> = {
  enumerate_all: {
    entityId: "*",
    filterSignature: "default_enumerate",
    filters: {},
    successCount: 0,
    attemptCount: 0,
    avgResultCount: 0,
    avgCriterionPassRate: 0,
    goal: "enumerate_all",
    lesson: "set limit high enough to avoid truncation",
  },
  find_specific: {
    entityId: "*",
    filterSignature: "default_find",
    filters: {},
    successCount: 0,
    attemptCount: 0,
    avgResultCount: 0,
    avgCriterionPassRate: 0,
    goal: "find_specific",
  },
  check_null: {
    entityId: "*",
    filterSignature: "default_null",
    filters: {},
    successCount: 0,
    attemptCount: 0,
    avgResultCount: 0,
    avgCriterionPassRate: 0,
    goal: "check_null",
  },
};

/** Merge learned entity fields with current JSON schema (catch new fields). */
export function mergeWithSchema(entity: CQEEntity, jsonSchema: JSONSchema): CQEEntity {
  const required = new Set(jsonSchema.required ?? []);
  const existing = new Map(entity.fields.map((f) => [f.name, f]));
  const mergedFields: CQEField[] = [...entity.fields];

  for (const [name, def] of Object.entries(jsonSchema.properties ?? {})) {
    if (!def || typeof def !== "object") continue;
    if (def.type === "array" && def.items?.type === "object") continue;
    if (existing.has(name)) continue;
    mergedFields.push({
      name,
      type:
        def.type === "integer"
          ? "Integer"
          : def.type === "number"
            ? "number"
            : def.type === "boolean"
              ? "boolean"
              : "string",
      nullable: !required.has(name),
      description: def.description,
    });
  }

  return {
    ...entity,
    fields: mergedFields,
    source: "meta_ontology",
    required: [...required],
    nullable: mergedFields.filter((f) => f.nullable).map((f) => f.name),
  };
}

export function scaffoldWithMeta(
  jsonSchema: JSONSchema,
  documentType: string,
  options: ScaffoldOptions = {}
): Effect.Effect<ScaffoldResult, OntologyError, MetaOntologyStoreService | OntologyIndexService> {
  return Effect.gen(function* () {
    const cfg = yield* readOntologyMetaConfig();
    const store = yield* MetaOntologyStoreService;
    const index = yield* OntologyIndexService;

    if (cfg.metaEnabled) {
      const learned = yield* store.getLearnedEntity(documentType);
      if (learned && learned.evidence_count >= cfg.minEvidence) {
        const entity = mergeWithSchema(JSON.parse(learned.entity_json) as CQEEntity, jsonSchema);
        entity.documentType = documentType;
        entity.id = options.entityId ?? entity.id;
        yield* index.registerDynamic(entity, {
          ttl: options.ttl ?? cfg.scaffoldTtl,
          overwrite: options.overwrite ?? true,
        });
        return {
          entity,
          entityId: entity.id,
          fieldCount: entity.fields.length,
          relationshipCount: entity.relationships.length,
          source: "meta_ontology",
          evidenceCount: learned.evidence_count,
          avgCriterionPassRate: learned.avg_criterion_pass_rate,
        };
      }
    }

    const result = yield* scaffoldFromJsonSchema(jsonSchema, {
      ...options,
      documentType,
    });
    result.entity.source = "json_schema_cold";
    result.source = "json_schema_cold";
    return result;
  });
}

export function getBestQueryStrategy(
  entityId: string,
  goal: QueryGoal
): Effect.Effect<QueryPattern, OntologyError, MetaOntologyStoreService> {
  return Effect.gen(function* () {
    const cfg = yield* readOntologyMetaConfig();
    const store = yield* MetaOntologyStoreService;
    const learned = yield* store.getBestQueryPattern(entityId, goal);
    const minPatternEvidence = Math.max(3, Math.floor(cfg.minEvidence / 2));
    if (learned && learned.successCount >= minPatternEvidence) {
      return learned;
    }
    return { ...DEFAULT_QUERY_STRATEGIES[goal], entityId };
  });
}
