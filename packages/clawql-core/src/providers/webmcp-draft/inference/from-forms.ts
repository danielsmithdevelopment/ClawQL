import { Effect } from "effect";
import { createHash } from "node:crypto";
import type { DraftCandidate, HtmlFormSnapshot, JsonSchema } from "../types.js";

function slugify(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function candidateId(sourceRef: string): string {
  const digest = createHash("sha256").update(`forms:${sourceRef}`).digest("hex").slice(0, 12);
  return `cand_form_${digest}`;
}

function fieldsToSchema(form: HtmlFormSnapshot): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const field of form.fields) {
    if (!field.name) continue;
    const type =
      field.type === "number" || field.type === "range"
        ? "number"
        : field.type === "checkbox"
          ? "boolean"
          : "string";
    properties[field.name] = {
      type,
      description: field.label ?? field.name,
    };
    if (field.required) required.push(field.name);
  }
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

/**
 * Draft WebMCP tool candidates from rendered HTML forms.
 * Weakest signal of the three sources — always confidence "low".
 */
export const draftFromForms = (
  forms: readonly HtmlFormSnapshot[]
): Effect.Effect<readonly DraftCandidate[]> =>
  Effect.sync(() => {
    const out: DraftCandidate[] = [];
    for (const form of forms) {
      if (form.fields.length === 0) continue;
      const sourceRef = form.selector;
      const label = form.name ?? form.action ?? form.selector;
      const name = slugify(`form_${label}`);
      out.push({
        candidateId: candidateId(sourceRef),
        sourceType: "forms",
        sourceRef,
        proposedTool: {
          name,
          description: `Submit form ${label}${form.action ? ` → ${form.method ?? "POST"} ${form.action}` : ""}`,
          inputSchema: fieldsToSchema(form),
        },
        confidence: "low",
        inferenceNotes:
          "Inferred from rendered HTML form fields only — no types or semantic names guaranteed; human review required.",
      });
    }
    return out;
  });
