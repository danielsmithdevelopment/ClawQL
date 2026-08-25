/**
 * ExtractBench-oriented helper: scaffold (Layer 2/3) → populate → memory ontology.db → recall.
 */
import { Effect, Layer } from "effect";
import { runOntologyRecall } from "clawql-memory/ontology";
import { getObsidianVaultPath } from "clawql-memory/vault/config";
import { OntologyError, ontologyFail, ontologyFromPromise } from "../effect/ontology-errors.js";
import { OntologyIndexLive, OntologyIndexService } from "./ontology-index.js";
import { scaffoldWithMeta } from "../layer3/meta/meta-scaffold.js";
import { MetaOntologyStoreLive } from "../layer3/meta/store.js";
import { populateFromRecord } from "../layer2/scaffold/populate-record.js";
import type {
  JSONSchema,
  ScaffoldOptions,
  ScaffoldResult,
} from "./cqe-runtime-types.js";
import { syncDocumentToMemoryOntology, syncEntityToMemoryOntology } from "./memory-bridge.js";

export type ExtractBenchOntologyPipelineInput = {
  jsonSchema: JSONSchema;
  documentType: string;
  documentId: string;
  /** Schema-shaped extraction (ExtractBench schema_map / Arm A|B output). */
  extracted: Record<string, unknown>;
  vaultRoot?: string;
  scaffoldOptions?: ScaffoldOptions;
  /** memory_recall filters; default enumerates non-null repeated relationships. */
  filters?: Record<string, Record<string, unknown>>;
  limit?: number;
};

export type ExtractBenchOntologyPipelineResult = {
  scaffold: ScaffoldResult;
  populatedFields: string[];
  nullFields: string[];
  rowsPopulated: Record<string, number>;
  recall: Awaited<ReturnType<typeof runOntologyRecall>>;
};

function defaultFilters(scaffold: ScaffoldResult): Record<string, Record<string, unknown>> {
  const filters: Record<string, Record<string, unknown>> = {};
  for (const rel of scaffold.entity.relationships) {
    if (rel.type === "repeated") {
      filters[rel.name] = { isNull: false };
    }
  }
  if (Object.keys(filters).length === 0) {
    filters.id = { isNull: false };
  }
  return filters;
}

/**
 * End-to-end ExtractBench path:
 * scaffoldWithMeta → populateFromRecord → sync to ontology.db → structured recall.
 */
export function runExtractBenchOntologyPipeline(
  input: ExtractBenchOntologyPipelineInput
): Effect.Effect<ExtractBenchOntologyPipelineResult, OntologyError> {
  const layer = Layer.merge(OntologyIndexLive, MetaOntologyStoreLive);
  return Effect.gen(function* () {
    const vault = input.vaultRoot?.trim() || getObsidianVaultPath();
    if (!vault) {
      return yield* ontologyFail(
        "No vault configured (pass vaultRoot or set CLAWQL_OBSIDIAN_VAULT_PATH)"
      );
    }

    const scaffold = yield* scaffoldWithMeta(input.jsonSchema, input.documentType, {
      ...input.scaffoldOptions,
      documentType: input.documentType,
      overwrite: input.scaffoldOptions?.overwrite ?? true,
    });

    const populated = yield* populateFromRecord(
      input.extracted,
      scaffold.entity,
      input.documentId
    );

    const index = yield* OntologyIndexService;
    const primary = yield* index.getRecord(scaffold.entityId, input.documentId);
    if (!primary) {
      return yield* ontologyFail(`Missing populated record for ${input.documentId}`);
    }

    const nested: Array<{ entityId: string; recordId: string; fields: Record<string, unknown> }> =
      [];
    for (const rel of scaffold.entity.relationships) {
      if (rel.type !== "repeated") continue;
      const rows = yield* index.listRecords(rel.targetEntity);
      for (const row of rows) {
        nested.push({
          entityId: rel.targetEntity,
          recordId: String(row.id),
          fields: row,
        });
      }
    }

    yield* syncDocumentToMemoryOntology(scaffold.entity, input.documentId, primary, {
      vaultRoot: vault,
      nested,
    });

    for (const rel of scaffold.entity.relationships) {
      const nestedEntity = yield* index.getEntity(rel.targetEntity);
      if (nestedEntity) {
        yield* syncEntityToMemoryOntology(nestedEntity, { vaultRoot: vault });
      }
    }

    const filters = input.filters ?? defaultFilters(scaffold);
    const recall = yield* ontologyFromPromise(() =>
      runOntologyRecall(vault, {
        query: `${input.documentType} extraction`,
        schema: scaffold.entityId,
        filters,
        limit: input.limit ?? 10000,
        confidenceMinimum: "EXTRACTED",
      })
    );

    return {
      scaffold,
      populatedFields: populated.populatedFields,
      nullFields: populated.nullFields,
      rowsPopulated: populated.rowsPopulated,
      recall,
    };
  }).pipe(Effect.provide(layer));
}

/** Promise façade for ExtractBench / scripts (forced host boundary). */
export function runExtractBenchOntologyPipelinePromise(
  input: ExtractBenchOntologyPipelineInput
): Promise<ExtractBenchOntologyPipelineResult> {
  return Effect.runPromise(runExtractBenchOntologyPipeline(input));
}
