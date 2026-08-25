/**
 * Layer 2 — scaffold from Docling (or Docling-like) document structure.
 * Spec: docs/specs/ontology/meta-ontology-v0.1.md §4.3
 */
import { Effect } from "effect";
import { readOntologyMetaConfig } from "../../effect/ontology-meta-config.js";
import { OntologyError, ontologyFail } from "../../effect/ontology-errors.js";
import { slugify } from "../../shared/slugify.js";
import { OntologyIndexService } from "../../shared/ontology-index.js";
import type {
  CQEEntity,
  CQEField,
  CQEFieldType,
  CQERelationship,
  DoclingOutput,
  DoclingTable,
  ScaffoldOptions,
  ScaffoldResult,
} from "../../shared/cqe-runtime-types.js";

export function inferTypeFromValue(value: unknown): CQEFieldType {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "Integer" : "number";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "ISODate";
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return "ISODateTime";
    if (/^https?:\/\//i.test(value)) return "URL";
    if (/^-?\d+(\.\d+)?$/.test(value.trim())) {
      return value.includes(".") ? "number" : "Integer";
    }
  }
  return "string";
}

export function inferTypeFromColumn(table: DoclingTable, headerIndex: number): CQEFieldType {
  for (const row of table.rows) {
    const cell = row[headerIndex];
    if (cell !== null && cell !== undefined && cell !== "") {
      return inferTypeFromValue(cell);
    }
  }
  return "string";
}

export function scaffoldFromDocling(
  doclingOutput: DoclingOutput,
  options: ScaffoldOptions = {}
): Effect.Effect<ScaffoldResult, OntologyError, OntologyIndexService> {
  return Effect.gen(function* () {
    const cfg = yield* readOntologyMetaConfig();
    if (!cfg.scaffoldEnabled) {
      return yield* ontologyFail("Layer 2 scaffolding disabled (CLAWQL_ONTOLOGY_SCAFFOLD_ENABLED=0)");
    }
    const index = yield* OntologyIndexService;
    const entityId =
      options.entityId ??
      (yield* slugify(doclingOutput.title ?? options.documentType ?? `doc_${Date.now()}`));

    const fields: CQEField[] = [];
    for (const formField of doclingOutput.formFields ?? []) {
      const name = yield* slugify(formField.label);
      fields.push({
        name,
        type: inferTypeFromValue(formField.value),
        nullable: true,
        sourceLocation: formField.boundingBox,
      });
    }

    const relationships: CQERelationship[] = [];
    for (const table of doclingOutput.tables ?? []) {
      const headers: CQEField[] = [];
      for (let i = 0; i < table.headers.length; i++) {
        const h = table.headers[i]!;
        const name = yield* slugify(h.text);
        headers.push({
          name,
          type: inferTypeFromColumn(table, i),
          nullable: true,
        });
      }
      const nestedEntityId = `${entityId}__table_${table.index}_record`;
      yield* index.registerDynamic(
        {
          id: nestedEntityId,
          source: "document_structure",
          fields: headers,
          relationships: [],
          scaffoldedAt: new Date().toISOString(),
        },
        { ttl: options.ttl ?? cfg.scaffoldTtl, overwrite: true }
      );
      relationships.push({
        name: `table_${table.index}`,
        type: "repeated",
        targetEntity: nestedEntityId,
        rowCount: table.rows.length,
      });
    }

    const entity: CQEEntity = {
      id: entityId,
      source: "document_structure",
      fields,
      relationships,
      scaffoldedAt: new Date().toISOString(),
      sessionId: options.sessionId,
      documentType: options.documentType,
    };

    yield* index.registerDynamic(entity, {
      ttl: options.ttl ?? cfg.scaffoldTtl,
      overwrite: options.overwrite ?? false,
    });

    return {
      entity,
      entityId,
      fieldCount: fields.length,
      relationshipCount: relationships.length,
      source: entity.source,
    };
  });
}
