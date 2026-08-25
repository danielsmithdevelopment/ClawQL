/**
 * Populate a scaffolded entity from a plain record (ExtractBench schema-map output).
 */
import { Effect } from "effect";
import { OntologyError, ontologyFail } from "../../effect/ontology-errors.js";
import { OntologyIndexService } from "../../shared/ontology-index.js";
import type { CQEEntity, PopulateResult } from "../../shared/cqe-runtime-types.js";
import { normalizeValue } from "./populate.js";

export function populateFromRecord(
  data: Record<string, unknown>,
  entity: CQEEntity,
  documentId: string
): Effect.Effect<PopulateResult, OntologyError, OntologyIndexService> {
  return Effect.gen(function* () {
    const index = yield* OntologyIndexService;
    const known = yield* index.getEntity(entity.id);
    if (!known) {
      return yield* ontologyFail(`Entity not registered in ontology index: ${entity.id}`);
    }

    const record: Record<string, unknown> = { id: documentId, ...data };
    const nullFields: string[] = [];
    const populatedFields: string[] = [];

    for (const field of entity.fields) {
      const raw = data[field.name];
      if (raw !== undefined && raw !== null && raw !== "") {
        record[field.name] = normalizeValue(raw, field.type);
        populatedFields.push(field.name);
      } else {
        record[field.name] = null;
        nullFields.push(field.name);
      }
    }

    const rowsPopulated: Record<string, number> = {};
    for (const relationship of entity.relationships) {
      if (relationship.type !== "repeated") continue;
      const rowsRaw = data[relationship.name];
      if (!Array.isArray(rowsRaw)) {
        record[relationship.name] = [];
        rowsPopulated[relationship.name] = 0;
        continue;
      }
      const nested = yield* index.getEntity(relationship.targetEntity);
      const rows = rowsRaw.map((row, i) => {
        const src = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
        const out: Record<string, unknown> = { id: String(src.id ?? `row_${i}`) };
        for (const f of nested?.fields ?? []) {
          out[f.name] = normalizeValue(src[f.name], f.type);
        }
        return out;
      });
      record[relationship.name] = rows;
      rowsPopulated[relationship.name] = rows.length;
      for (const row of rows) {
        yield* index.upsert(relationship.targetEntity, `${documentId}:${String(row.id)}`, {
          ...row,
          parentDocumentId: documentId,
        });
      }
    }

    yield* index.upsert(entity.id, documentId, record);
    return { populatedFields, nullFields, rowsPopulated };
  });
}
