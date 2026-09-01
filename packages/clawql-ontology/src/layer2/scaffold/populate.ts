/**
 * Layer 2 — populate scaffolded index from Docling extraction.
 * Spec: docs/specs/ontology/meta-ontology-v0.1.md §4.4
 */
import { Effect } from "effect";
import { OntologyError, ontologyFail } from "../../effect/ontology-errors.js";
import { slugify } from "../../shared/slugify.js";
import { OntologyIndexService } from "../../shared/ontology-index.js";
import type {
  CQEEntity,
  CQEFieldType,
  DoclingOutput,
  DoclingTable,
  PopulateResult,
} from "../../shared/cqe-runtime-types.js";

export function normalizeValue(value: unknown, type: CQEFieldType): unknown {
  if (value === null || value === undefined || value === "") return null;
  switch (type) {
    case "Integer": {
      const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case "number":
    case "Percentage": {
      const n = typeof value === "number" ? value : Number(String(value).replace(/[,$%]/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    case "boolean":
      if (typeof value === "boolean") return value;
      return ["true", "yes", "1", "y"].includes(String(value).toLowerCase());
    default:
      return value;
  }
}

function mapRowToRecord(
  row: unknown[],
  headers: { name: string; type: CQEFieldType }[],
  rowIndex: number
): Record<string, unknown> {
  const record: Record<string, unknown> = { id: `row_${rowIndex}` };
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!;
    record[h.name] = normalizeValue(row[i], h.type);
  }
  return record;
}

export function populateFromDocling(
  doclingOutput: DoclingOutput,
  entity: CQEEntity,
  documentId: string
): Effect.Effect<PopulateResult, OntologyError, OntologyIndexService> {
  return Effect.gen(function* () {
    const index = yield* OntologyIndexService;
    const known = yield* index.getEntity(entity.id);
    if (!known) {
      return yield* ontologyFail(`Entity not registered in ontology index: ${entity.id}`);
    }

    const record: Record<string, unknown> = { id: documentId };
    const nullFields: string[] = [];
    const populatedFields: string[] = [];

    const formSlugByLabel = new Map<string, string>();
    for (const formField of doclingOutput.formFields ?? []) {
      formSlugByLabel.set(formField.label, yield* slugify(formField.label));
    }

    for (const field of entity.fields) {
      const formField = (doclingOutput.formFields ?? []).find(
        (f) => formSlugByLabel.get(f.label) === field.name
      );
      if (formField?.value !== undefined && formField.value !== null && formField.value !== "") {
        record[field.name] = normalizeValue(formField.value, field.type);
        populatedFields.push(field.name);
      } else {
        record[field.name] = null;
        nullFields.push(field.name);
      }
    }

    const rowsPopulated: Record<string, number> = {};
    for (const relationship of entity.relationships) {
      if (relationship.type !== "repeated") continue;
      const table: DoclingTable | undefined = (doclingOutput.tables ?? []).find(
        (t) => `table_${t.index}` === relationship.name
      );
      if (!table) {
        record[relationship.name] = [];
        rowsPopulated[relationship.name] = 0;
        continue;
      }
      const nested = yield* index.getEntity(relationship.targetEntity);
      const headers: { name: string; type: CQEFieldType }[] = [];
      if (nested?.fields.length) {
        for (const f of nested.fields) headers.push({ name: f.name, type: f.type });
      } else {
        for (const h of table.headers) {
          headers.push({ name: yield* slugify(h.text), type: "string" });
        }
      }
      // Enumerate ALL rows — T1 completeness (no truncation)
      const rows = table.rows.map((row, i) => mapRowToRecord(row, headers, i));
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
