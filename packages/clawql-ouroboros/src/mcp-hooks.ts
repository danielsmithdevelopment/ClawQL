import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { SeedSchema, type Seed } from "./seed.js";
import { EvolutionaryLoop } from "./evolutionary-loop.js";
import type { EventStore } from "./interfaces.js";
import { driftReportPayload, measureDrift } from "./drift.js";
import {
  langfuseEvalAutoApplyEnabled,
  loadLatestSeedFromLineage,
  normalizeLangfuseEvalPayload,
  parseLangfuseMinScore,
  processLangfuseEval,
} from "./eval/index.js";

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

export const MeasureDriftSchema = z.object({
  /** Lineage root id (upstream `session_id`). */
  seedId: z.string().optional(),
  /** Inline seed object (preferred when not loading from lineage). */
  seed: z.unknown().optional(),
  /** Free-form seed text/YAML when a structured seed object is unavailable. */
  seedContent: z.string().optional(),
  currentOutput: z.string().min(1),
  constraintViolations: z.array(z.string()).optional().default([]),
  currentConcepts: z.array(z.string()).optional().default([]),
  generationNumber: z.number().int().min(1).optional(),
  /** When true (default), append `drift_measured` to the event store when `seedId` is set. */
  persistEvent: z.boolean().optional().default(true),
});

export const ProposeSeedRevisionFromEvalSchema = z.object({
  /** Raw Langfuse webhook / export JSON, or omit when passing explicit score fields. */
  payload: z.unknown().optional(),
  scoreName: z.string().optional(),
  scoreValue: z.number().min(0).max(1).optional(),
  seedId: z.string().optional(),
  traceId: z.string().optional(),
  comment: z.string().optional(),
  correlationId: z.string().optional(),
  /** Override `CLAWQL_LANGFUSE_EVAL_AUTO_APPLY` for this call. */
  autoApply: z.boolean().optional(),
  /** Override `CLAWQL_LANGFUSE_EVAL_MIN_SCORE` for this call. */
  minScore: z.number().min(0).max(1).optional(),
  /** Inline seed when lineage lookup is unavailable. */
  baseSeed: z.unknown().optional(),
});

// ---------------------------------------------------------------------------

function deriveGoal(
  documentId: string,
  metadata: Record<string, unknown>,
  goalHint?: string
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
  maxFields = 8
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

async function resolveBaselineSeed(
  input: z.infer<typeof MeasureDriftSchema>,
  eventStore: EventStore,
): Promise<Seed | null> {
  if (input.seed !== undefined) {
    return SeedSchema.parse(input.seed);
  }

  if (input.seedId) {
    const lineage = await eventStore.getLineage(input.seedId);
    if (lineage.generations.length > 0) {
      return lineage.generations[0].seed;
    }
  }

  if (input.seedContent?.trim()) {
    const goalMatch = input.seedContent.match(/goal:\s*["']?([^\n"']+)/i);
    const goal = goalMatch?.[1]?.trim() || "Unspecified goal from seedContent";
    return SeedSchema.parse({
      goal,
      task_type: "analysis",
      brownfield_context: {
        project_type: "brownfield",
        context_references: [],
        existing_patterns: [],
        existing_dependencies: [],
      },
      constraints: [],
      acceptance_criteria: [],
      ontology_schema: { name: "InlineSeed", description: goal, fields: [] },
      evaluation_principles: [],
      exit_conditions: [],
      metadata: {
        seed_id: input.seedId ?? `seed_inline_${uuidv4().slice(0, 8)}`,
        version: "1.0.0",
        created_at: new Date(),
        ambiguity_score: 0.15,
        interview_id: null,
        parent_seed_id: null,
      },
    });
  }

  return null;
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
      _context: OuroborosContext
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

  measureDrift: {
    name: "ouroboros_measure_drift" as const,
    description:
      "Measure 3-component goal/constraint/ontology drift vs the root Seed (Q00 upstream model; epic #556 / #557)",
    inputSchema: MeasureDriftSchema,

    handler: async (
      input: z.infer<typeof MeasureDriftSchema>,
      context: OuroborosContext,
    ): Promise<
      | { ok: true; report: ReturnType<typeof driftReportPayload>; seedId: string | null }
      | { ok: false; error: string }
    > => {
      try {
        const baselineSeed = await resolveBaselineSeed(input, context.eventStore);
        if (!baselineSeed) {
          return {
            ok: false,
            error: "Provide `seed`, `seedId` with lineage events, or `seedContent`",
          };
        }

        const report = measureDrift({
          baselineSeed,
          currentOutput: input.currentOutput,
          constraintViolations: input.constraintViolations,
          currentConcepts: input.currentConcepts,
        });

        const rootSeedId = input.seedId ?? baselineSeed.metadata.seed_id;
        const payload = driftReportPayload(report, {
          generation_number: input.generationNumber ?? null,
          constraint_violations: input.constraintViolations ?? [],
          current_concepts: input.currentConcepts ?? [],
        });

        if (input.persistEvent !== false && input.seedId) {
          await context.eventStore.append({
            type: "drift_measured",
            seed_id: input.seedId,
            data: payload,
            timestamp: new Date(),
          });
        }

        return { ok: true, report: payload, seedId: rootSeedId };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  },

  proposeSeedRevisionFromEval: {
    name: "ouroboros_propose_seed_revision_from_eval" as const,
    description:
      "Normalize a Langfuse eval score and propose (or optionally apply) an Ouroboros seed revision ([#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250))",
    inputSchema: ProposeSeedRevisionFromEvalSchema,

    handler: async (
      input: z.infer<typeof ProposeSeedRevisionFromEvalSchema>,
      context: OuroborosContext
    ) => {
      let evalEvent =
        input.payload !== undefined ? normalizeLangfuseEvalPayload(input.payload) : null;
      if (!evalEvent && input.scoreValue !== undefined) {
        evalEvent = {
          scoreName: input.scoreName?.trim() || "langfuse_score",
          scoreValue: input.scoreValue,
          traceId: input.traceId,
          seedId: input.seedId,
          correlationId: input.correlationId,
          comment: input.comment,
          metadata: {},
        };
      }
      if (!evalEvent) {
        return {
          ok: false,
          error: "Missing eval: provide `payload` or `scoreValue` (+ optional scoreName/seedId)",
        };
      }

      const minScore = input.minScore ?? parseLangfuseMinScore(process.env);
      const autoApply = input.autoApply ?? langfuseEvalAutoApplyEnabled(process.env);
      let baseSeed: Seed | undefined;
      if (input.baseSeed !== undefined) {
        baseSeed = SeedSchema.parse(input.baseSeed);
      }

      return await processLangfuseEval(evalEvent, {
        minScore,
        autoApply,
        eventStore: context.eventStore,
        baseSeed,
        loadSeedByLineageId: async (seedId) =>
          loadLatestSeedFromLineage(context.eventStore, seedId),
      });
    },
  },
} as const;
