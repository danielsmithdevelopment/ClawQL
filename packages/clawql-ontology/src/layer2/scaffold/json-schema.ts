/**
 * Layer 2 — scaffold CQE entities from JSON Schema.
 * Spec: docs/specs/ontology/meta-ontology-v0.1.md §4.2
 */
import { Effect } from "effect";
import {
  readOntologyMetaConfig,
  type OntologyMetaConfig,
} from "../../effect/ontology-meta-config.js";
import { OntologyError, ontologyFail } from "../../effect/ontology-errors.js";
import { sha256Hex } from "../../shared/crypto-hash.js";
import { slugify } from "../../shared/slugify.js";
import {
  OntologyIndexService,
  type OntologyIndexService as OntologyIndexServiceType,
} from "../../shared/ontology-index.js";
import type {
  CQEEntity,
  CQEField,
  CQEFieldType,
  CQERelationship,
  JSONSchema,
  ScaffoldOptions,
  ScaffoldResult,
} from "../../shared/cqe-runtime-types.js";

function primaryType(type: string | string[] | undefined): string {
  if (Array.isArray(type)) return type.find((t) => t !== "null") ?? type[0] ?? "string";
  return type ?? "string";
}

export function jsonTypeToCQEType(
  type: string | string[] | undefined,
  format?: string
): CQEFieldType {
  const t = primaryType(type);
  switch (t) {
    case "string":
      if (format === "date") return "ISODate";
      if (format === "date-time") return "ISODateTime";
      if (format === "uri" || format === "url") return "URL";
      return "string";
    case "number":
      return "number";
    case "integer":
      return "Integer";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    default:
      return "string";
  }
}

function generateEntityId(schema: JSONSchema, fallback: string): Effect.Effect<string> {
  return Effect.gen(function* () {
    if (schema.title) return yield* slugify(String(schema.title));
    if (schema.$id) {
      const leaf = String(schema.$id).split("/").pop() ?? fallback;
      return yield* slugify(leaf.replace(/\.json$/i, ""));
    }
    return fallback;
  });
}

function extractFields(schema: JSONSchema): Effect.Effect<CQEField[]> {
  return Effect.sync(() => {
    const fields: CQEField[] = [];
    const required = new Set(schema.required ?? []);
    for (const [name, def] of Object.entries(schema.properties ?? {})) {
      if (!def || typeof def !== "object") continue;
      if (primaryType(def.type) === "array" && def.items && primaryType(def.items.type) === "object") {
        continue;
      }
      // Nested object (non-array) → flatten as string JSON for v0.1 scalar index
      if (primaryType(def.type) === "object" && def.properties) {
        fields.push({
          name,
          type: "string",
          nullable: !required.has(name),
          description: def.description ?? "nested object (serialized)",
          examples: def.examples,
        });
        continue;
      }
      fields.push({
        name,
        type: jsonTypeToCQEType(def.type, def.format),
        nullable: !required.has(name),
        description: def.description,
        examples: def.examples,
      });
    }
    return fields;
  });
}

function extractRelationships(
  schema: JSONSchema,
  parentId: string,
  registerNested: (entity: CQEEntity) => Effect.Effect<CQEEntity, OntologyError, OntologyIndexServiceType>
): Effect.Effect<CQERelationship[], OntologyError, OntologyIndexServiceType> {
  return Effect.gen(function* () {
    const relationships: CQERelationship[] = [];
    for (const [name, def] of Object.entries(schema.properties ?? {})) {
      if (!def || typeof def !== "object") continue;
      if (primaryType(def.type) !== "array" || !def.items || primaryType(def.items.type) !== "object") {
        continue;
      }
      const nestedId = `${parentId}__${name}_record`;
      const nestedFields = yield* extractFields(def.items);
      const nestedRequired = def.items.required ?? [];
      const nested: CQEEntity = {
        id: nestedId,
        source: "json_schema",
        fields: nestedFields,
        relationships: [],
        required: nestedRequired,
        nullable: nestedFields.filter((f) => f.nullable).map((f) => f.name),
        scaffoldedAt: new Date().toISOString(),
      };
      yield* registerNested(nested);
      relationships.push({
        name,
        type: "repeated",
        targetEntity: nestedId,
        description: def.description,
      });
    }
    return relationships;
  });
}

export function scaffoldFromJsonSchema(
  jsonSchema: JSONSchema,
  options: ScaffoldOptions = {}
): Effect.Effect<ScaffoldResult, OntologyError, OntologyIndexServiceType> {
  return Effect.gen(function* () {
    const cfg: OntologyMetaConfig = yield* readOntologyMetaConfig();
    if (!cfg.scaffoldEnabled) {
      return yield* ontologyFail("Layer 2 scaffolding disabled (CLAWQL_ONTOLOGY_SCAFFOLD_ENABLED=0)");
    }
    const index = yield* OntologyIndexService;
    const entityId =
      options.entityId ?? (yield* generateEntityId(jsonSchema, `entity_${Date.now()}`));
    const fields = yield* extractFields(jsonSchema);
    const relationships = yield* extractRelationships(jsonSchema, entityId, (nested) =>
      index.registerDynamic(nested, {
        ttl: options.ttl ?? cfg.scaffoldTtl,
        overwrite: options.overwrite ?? true,
      })
    );
    const sourceHash = yield* sha256Hex(JSON.stringify(jsonSchema));
    const entity: CQEEntity = {
      id: entityId,
      source: "json_schema",
      sourceHash,
      fields,
      relationships,
      nullable: fields.filter((f) => f.nullable).map((f) => f.name),
      required: jsonSchema.required ?? fields.filter((f) => !f.nullable).map((f) => f.name),
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
