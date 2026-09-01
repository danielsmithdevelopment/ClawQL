/**
 * Convert runtime CQE entities to Layer 1 YAML `.cqe` documents.
 */
import { Effect } from "effect";
import type { CQEEntity, CQEFieldType } from "./cqe-runtime-types.js";
import { ontologySync } from "../effect/ontology-errors.js";

function cqeTypeToYaml(type: CQEFieldType): string {
  switch (type) {
    case "Integer":
      return "integer";
    case "Percentage":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "ISODate":
    case "ISODateTime":
    case "URL":
    case "string":
    case "null":
    default:
      return "string";
  }
}

function pascalFromId(id: string): string {
  return id
    .split(/[_\-./]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

/** Serialize a runtime entity to ADR 0010 `.cqe` YAML. */
export function cqeEntityToYaml(entity: CQEEntity): Effect.Effect<string> {
  return ontologySync(() => {
    const name = pascalFromId(entity.id);
    const lines: string[] = [
      "apiVersion: clawql.dev/ontology/v1alpha1",
      "kind: Entity",
      "metadata:",
      `  name: ${name}`,
      "  labels:",
      "    source: meta_ontology_promotion",
      `    document_type: ${entity.documentType ?? entity.id}`,
      "spec:",
      `  description: >`,
      `    Promoted from Layer 3 meta-ontology (entity id: ${entity.id}).`,
      `    Evidence: ${entity.evidenceCount ?? 0}; avg CPR: ${entity.avgCriterionPassRate ?? 0}.`,
      "  properties:",
    ];
    for (const field of entity.fields) {
      lines.push(`    ${field.name}:`);
      lines.push(`      type: ${cqeTypeToYaml(field.type)}`);
      if (!field.nullable) lines.push(`      required: true`);
      if (field.description) {
        lines.push(`      description: ${JSON.stringify(field.description)}`);
      }
    }
    if (entity.relationships.length) {
      lines.push("  relationships:");
      for (const rel of entity.relationships) {
        lines.push(`    - entity: ${pascalFromId(rel.targetEntity)}`);
        lines.push(`      type: ${rel.type === "repeated" ? "one_to_many" : rel.type}`);
        lines.push(`      via: ${rel.name}`);
        if (rel.description) {
          lines.push(`      description: ${JSON.stringify(rel.description)}`);
        }
      }
    }
    lines.push("  actions:");
    lines.push(`    - name: search_${entity.id.replace(/[^a-zA-Z0-9]+/g, "_")}`);
    lines.push("      kind: read");
    lines.push("");
    return lines.join("\n");
  });
}

export function cqeEntityToYamlSync(entity: CQEEntity): string {
  return Effect.runSync(cqeEntityToYaml(entity));
}
