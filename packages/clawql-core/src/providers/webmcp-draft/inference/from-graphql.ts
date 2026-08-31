import { Effect } from "effect";
import { createHash } from "node:crypto";
import type { DraftCandidate, GraphQlSchemaInput, JsonSchema } from "../types.js";

const SKIP_MUTATION_RE = /^(health|ping|__)/i;
const USER_FACING_RE =
  /(create|update|delete|add|remove|book|checkout|cart|upload|send|submit|track|order|pay|invite|register)/i;

function slugify(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function candidateId(sourceRef: string): string {
  const digest = createHash("sha256").update(`graphql:${sourceRef}`).digest("hex").slice(0, 12);
  return `cand_gql_${digest}`;
}

function argsToSchema(
  args:
    | readonly {
        readonly name: string;
        readonly type: string;
        readonly description?: string;
        readonly required?: boolean;
      }[]
    | undefined
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const arg of args ?? []) {
    const lower = arg.type.toLowerCase();
    const type =
      lower.includes("int") || lower.includes("float") || lower.includes("id")
        ? lower.includes("float")
          ? "number"
          : lower.includes("int")
            ? "integer"
            : "string"
        : lower.includes("bool")
          ? "boolean"
          : "string";
    properties[arg.name] = {
      type,
      description: arg.description,
    };
    if (arg.required || arg.type.endsWith("!")) required.push(arg.name);
  }
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

function parseSdlMutations(sdl: string): NonNullable<GraphQlSchemaInput["mutations"]> {
  const mutations: Array<{
    name: string;
    args: Array<{ name: string; type: string; required: boolean }>;
  }> = [];
  const typeMatch = sdl.match(/type\s+Mutation\s*\{([\s\S]*?)\}/);
  if (!typeMatch) return mutations;
  const body = typeMatch[1] ?? "";
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?/);
    if (!m) continue;
    const name = m[1]!;
    const argSrc = m[2] ?? "";
    const args = argSrc
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const am = part.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^\s=]+)/);
        if (!am) return null;
        return {
          name: am[1]!,
          type: am[2]!,
          required: am[2]!.endsWith("!"),
        };
      })
      .filter((x): x is { name: string; type: string; required: boolean } => x !== null);
    mutations.push({ name, args });
  }
  return mutations;
}

/**
 * Draft WebMCP tool candidates from a GraphQL schema.
 * Stub: prefers mutations that look like user-facing actions; skips health/introspection noise.
 */
export const draftFromGraphql = (
  schema: GraphQlSchemaInput
): Effect.Effect<readonly DraftCandidate[]> =>
  Effect.sync(() => {
    const mutations =
      schema.mutations ?? (schema.sdl ? parseSdlMutations(schema.sdl) : []) ?? [];
    const out: DraftCandidate[] = [];
    for (const mut of mutations) {
      if (SKIP_MUTATION_RE.test(mut.name)) continue;
      const confidence: DraftCandidate["confidence"] = USER_FACING_RE.test(mut.name)
        ? "high"
        : "medium";
      const sourceRef = `Mutation.${mut.name}`;
      out.push({
        candidateId: candidateId(sourceRef),
        sourceType: "graphql",
        sourceRef,
        proposedTool: {
          name: slugify(mut.name),
          description: mut.description?.trim() || `GraphQL mutation ${mut.name}`,
          inputSchema: argsToSchema(mut.args),
        },
        confidence,
        inferenceNotes: `Inferred from GraphQL ${sourceRef}; mutations map naturally to WebMCP actions (heuristic stub, no LLM).`,
      });
    }
    return out;
  });
