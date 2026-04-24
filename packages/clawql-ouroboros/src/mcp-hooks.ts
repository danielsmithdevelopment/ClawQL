import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { SeedSchema, type Seed } from "./seed.js";
import { EvolutionaryLoop } from "./evolutionary-loop.js";
import type { EventStore } from "./interfaces.js";

// ---------------------------------------------------------------------------
// Typed MCP context
// ---------------------------------------------------------------------------

export interface OuroborosContext {
  ouroborosLoop: EvolutionaryLoop;
  eventStore: EventStore;
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const CreateSeedFromDocumentSchema = z.object({
  documentId: z.string().min(1),
  extractedText: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  goalHint: z.string().optional(),
  taskType: z.enum(["code", "research", "analysis", "ingest"]).default("ingest"),
});

export const RunOuroborosSchema = z.object({
  seed: z.unknown(),
  maxGenerations: z.number().int().min(1).max(50).default(12),
  convergenceThreshold: z.number().min(0.5).max(1.0).default(0.95),
});

export const GetLineageStatusSchema = z.object({
  seedId: z.string().min(1),
});

// ---------------------------------------------------------------------------

function deriveGoal(
  documentId: string,
  metadata: Record<string, unknown>,
  goalHint?: string,
): string {
  if (goalHint) return goalHint;
  const title =
    (metadata["title"] as string | undefined) ??
    (metadata["filename"] as string | undefined) ??
    (metadata["subject"] as string | undefined);
  if (title) return `Extract and evolve structured knowledge from: ${title}`;
  return `Process and evolve knowledge from document ${documentId}`;
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "can",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "as",
  "if",
  "then",
  "than",
  "so",
  "not",
  "no",
  "yes",
  "all",
  "any",
  "each",
  "some",
  "such",
  "other",
  "also",
  "into",
  "about",
  "up",
  "out",
  "over",
  "after",
  "before",
  "between",
  "through",
  "during",
]);

function inferOntologyFields(
  text: string,
  maxFields = 8,
): Array<{ name: string; field_type: string; description: string; required: boolean }> {
  const freq = new Map<string, number>();

  for (const token of text.toLowerCase().split(/\W+/)) {
    if (token.length < 4) continue;
    if (STOP_WORDS.has(token)) continue;
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }

  const candidates = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxFields)
    .map(([name]) => ({
      name,
      field_type: "string",
      description: `Extracted concept: ${name}`,
      required: false,
    }));

  return [
    {
      name: "content_summary",
      field_type: "string",
      description: "Summary of document content",
      required: true,
    },
    {
      name: "document_id",
      field_type: "string",
      description: "Source document identifier",
      required: true,
    },
    ...candidates,
  ];
}

// ---------------------------------------------------------------------------

export const ouroborosMcpTools = {
  createSeedFromDocument: {
    name: "ouroboros_create_seed_from_document" as const,
    description:
      "Convert raw extracted document text into a crystallized Seed for evolutionary processing",
    inputSchema: CreateSeedFromDocumentSchema,

    handler: async (
      input: z.infer<typeof CreateSeedFromDocumentSchema>,
      _context: OuroborosContext,
    ): Promise<{ success: true; seed: Seed } | { success: false; error: string }> => {
      try {
        const goal = deriveGoal(input.documentId, input.metadata, input.goalHint);
        const fields = inferOntologyFields(input.extractedText);

        const raw = {
          goal,
          task_type: input.taskType,
          brownfield_context: {
            project_type: "brownfield" as const,
            context_references: [input.documentId],
            existing_patterns: [],
            existing_dependencies: [],
          },
          constraints: ["Preserve semantic fidelity to source document"],
          acceptance_criteria: [
            "Ontology fields cover main topics of the document",
            "Ontology similarity convergence >= 0.92",
          ],
          ontology_schema: {
            name: `DocumentOntology_${input.documentId}`,
            description: `Knowledge ontology extracted from document ${input.documentId}`,
            fields,
          },
          evaluation_principles: [
            {
              name: "Semantic fidelity",
              description: "Output faithfully represents source content",
              weight: 0.6,
            },
            {
              name: "Ontology completeness",
              description: "Key entities and relations captured",
              weight: 0.4,
            },
          ],
          exit_conditions: [
            {
              name: "High similarity",
              description: "Ontology stable across generations",
              evaluation_criteria: "Similarity >= 0.95 for 2+ generations",
            },
          ],
          metadata: {
            seed_id: `docseed_${input.documentId}_${uuidv4().slice(0, 8)}`,
            version: "1.0.0",
            created_at: new Date(),
            ambiguity_score: Math.min(0.8, 500 / Math.max(input.extractedText.length, 1)),
            interview_id: null,
            parent_seed_id: null,
          },
        };

        const parsed = SeedSchema.parse(raw);
        return { success: true, seed: parsed };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  },

  runEvolutionaryLoop: {
    name: "ouroboros_run_evolutionary_loop" as const,
    description: "Run the full Ouroboros evolutionary loop on a Seed",
    inputSchema: RunOuroborosSchema,

    handler: async (input: z.infer<typeof RunOuroborosSchema>, context: OuroborosContext) => {
      const validatedSeed = SeedSchema.parse(input.seed);
      const result = await context.ouroborosLoop.run(validatedSeed, {
        maxGenerations: input.maxGenerations,
        convergenceThreshold: input.convergenceThreshold,
      });
      return {
        converged: result.converged,
        generations: result.generations.length,
        finalSeed: result.finalSeed,
        lineageId: result.lineage.seed_id,
        status: result.lineage.status,
        summary: result.converged
          ? `Converged in ${result.generations.length} generation(s)`
          : `Exhausted ${result.generations.length} generation(s) without convergence`,
      };
    },
  },

  getLineageStatus: {
    name: "ouroboros_get_lineage_status" as const,
    description: "Query status of an ongoing or completed evolutionary lineage",
    inputSchema: GetLineageStatusSchema,

    handler: async (input: z.infer<typeof GetLineageStatusSchema>, context: OuroborosContext) => {
      return await context.eventStore.getLineage(input.seedId);
    },
  },
} as const;
