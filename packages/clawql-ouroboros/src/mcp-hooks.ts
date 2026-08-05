import { z } from "zod";
import { SeedSchema, type Seed } from "./seed.js";
import { EvolutionaryLoop } from "./evolutionary-loop.js";
import type { EventStore } from "./interfaces.js";
import { driftReportPayload, measureDrift } from "./drift.js";
import { resolveBaselineSeed } from "./glue/resolve-baseline-seed.js";
import { createSeedFromDocumentCore } from "./glue/seed-from-document.js";
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
      return createSeedFromDocumentCore(input);
    },
  },

  runEvolutionaryLoop: {
    name: "ouroboros_run_evolutionary_loop" as const,
    description: "Run the full Ouroboros evolutionary loop on a Seed",
    inputSchema: RunOuroborosSchema,

    handler: async (input: z.infer<typeof RunOuroborosSchema>, context: OuroborosContext) => {
      const validatedSeed = SeedSchema.parse(input.seed);
      // OpenBench / spend guard: optional hard ceiling on evolutionary generations.
      const envCapRaw = process.env.CLAWQL_OUROBOROS_MAX_GENERATIONS?.trim();
      const envCap = envCapRaw ? Number.parseInt(envCapRaw, 10) : NaN;
      let maxGenerations = input.maxGenerations;
      if (Number.isFinite(envCap) && envCap >= 1) {
        maxGenerations = Math.min(maxGenerations, Math.min(50, envCap));
      }
      const result = await context.ouroborosLoop.run(validatedSeed, {
        maxGenerations,
        convergenceThreshold: input.convergenceThreshold,
      });
      return {
        converged: result.converged,
        generations: result.generations.length,
        finalSeed: result.finalSeed,
        lineageId: result.lineage.seed_id,
        status: result.lineage.status,
        summary: result.converged
          ? `Converged in ${result.generations.length} generation(s) (cap=${maxGenerations})`
          : `Exhausted ${result.generations.length} generation(s) without convergence (cap=${maxGenerations})`,
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
      context: OuroborosContext
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
