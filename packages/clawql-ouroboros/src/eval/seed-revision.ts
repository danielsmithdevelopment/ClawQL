/**
 * Map normalized Langfuse evals to Ouroboros seed revision proposals ([#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250)).
 */

import { v4 as uuidv4 } from "uuid";
import type { EventStore } from "../interfaces.js";
import { SeedSchema, type Seed } from "../seed.js";
import type { NormalizedLangfuseEval } from "./langfuse-normalize.js";

export type SeedRevisionAction = "ticket" | "proposed" | "applied";

export type SeedRevisionProposal = {
  action: SeedRevisionAction;
  reason: string;
  patch?: Partial<Omit<Seed, "metadata">>;
  rationale?: string;
};

export type ProcessLangfuseEvalOptions = {
  minScore: number;
  /** When false (default), never mutates lineage — only proposes + records events. */
  autoApply: boolean;
  eventStore?: EventStore;
  loadSeedByLineageId?: (seedId: string) => Promise<Seed | null>;
  /** Inline seed when lineage lookup is unavailable (MCP tool path). */
  baseSeed?: Seed;
};

export type ProcessLangfuseEvalResult = {
  ok: boolean;
  action: SeedRevisionAction;
  reason: string;
  dryRun: boolean;
  scoreName: string;
  scoreValue: number;
  minScore: number;
  seedId?: string;
  traceId?: string;
  correlationId?: string;
  proposal?: SeedRevisionProposal;
  revisedSeed?: Seed;
  error?: string;
};

type EnvMap = Record<string, string | undefined>;

function resolveEnv(env?: EnvMap): EnvMap {
  if (env) return env;
  return typeof process !== "undefined" ? process.env : {};
}

export function parseLangfuseMinScore(env?: EnvMap): number {
  const raw = resolveEnv(env).CLAWQL_LANGFUSE_EVAL_MIN_SCORE?.trim();
  if (!raw) return 0.8;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.8;
}

export function langfuseEvalAutoApplyEnabled(env?: EnvMap): boolean {
  const v = resolveEnv(env).CLAWQL_LANGFUSE_EVAL_AUTO_APPLY?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Load the latest seed snapshot from an Ouroboros lineage, if any generations exist. */
export async function loadLatestSeedFromLineage(
  eventStore: EventStore,
  rootSeedId: string
): Promise<Seed | null> {
  const lineage = await eventStore.getLineage(rootSeedId);
  if (lineage.generations.length === 0) return null;
  const last = lineage.generations[lineage.generations.length - 1];
  return SeedSchema.parse(last.seed);
}

export function buildSeedRevisionProposal(
  evalEvent: NormalizedLangfuseEval,
  baseSeed: Seed,
  minScore: number
): SeedRevisionProposal {
  if (evalEvent.scoreValue < minScore) {
    return {
      action: "ticket",
      reason: `Score ${evalEvent.scoreName}=${evalEvent.scoreValue} below threshold ${minScore} — human review recommended`,
    };
  }

  const principleName = `Langfuse: ${evalEvent.scoreName}`;
  const description =
    evalEvent.comment?.trim() ||
    `Production eval ${evalEvent.scoreName} scored ${evalEvent.scoreValue} (trace ${evalEvent.traceId ?? "n/a"})`;

  const existingNames = new Set(baseSeed.evaluation_principles.map((p) => p.name));
  const evaluation_principles = [...baseSeed.evaluation_principles];
  if (!existingNames.has(principleName)) {
    evaluation_principles.push({
      name: principleName,
      description,
      weight: 0.5,
    });
  }

  const criterion = `Maintain ${evalEvent.scoreName} >= ${minScore} in production (Langfuse trace ${evalEvent.traceId ?? "n/a"})`;
  const acceptance_criteria = baseSeed.acceptance_criteria.includes(criterion)
    ? baseSeed.acceptance_criteria
    : [...baseSeed.acceptance_criteria, criterion];

  return {
    action: "proposed",
    reason: `Score ${evalEvent.scoreValue} meets threshold ${minScore}`,
    patch: { evaluation_principles, acceptance_criteria },
    rationale: `Incorporate Langfuse metric ${evalEvent.scoreName} into seed acceptance gates`,
  };
}

function applyPatchToSeed(baseSeed: Seed, patch: Partial<Omit<Seed, "metadata">>): Seed {
  const parentId = baseSeed.metadata.seed_id;
  const merged = {
    ...baseSeed,
    ...patch,
    metadata: {
      ...baseSeed.metadata,
      parent_seed_id: parentId,
      seed_id: `seed_${uuidv4().slice(0, 12)}`,
      version: bumpPatchVersion(baseSeed.metadata.version),
    },
  };
  return SeedSchema.parse(merged);
}

function bumpPatchVersion(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!m) return version;
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

export async function processLangfuseEval(
  evalEvent: NormalizedLangfuseEval,
  options: ProcessLangfuseEvalOptions
): Promise<ProcessLangfuseEvalResult> {
  const dryRun = !options.autoApply;
  const base: Omit<ProcessLangfuseEvalResult, "ok" | "action" | "reason" | "proposal"> = {
    dryRun,
    scoreName: evalEvent.scoreName,
    scoreValue: evalEvent.scoreValue,
    minScore: options.minScore,
    seedId: evalEvent.seedId,
    traceId: evalEvent.traceId,
    correlationId: evalEvent.correlationId,
  };

  let baseSeed: Seed | null = options.baseSeed ?? null;
  if (!baseSeed && evalEvent.seedId && options.loadSeedByLineageId) {
    baseSeed = await options.loadSeedByLineageId(evalEvent.seedId);
  }

  if (evalEvent.seedId && options.eventStore) {
    await options.eventStore.append({
      type: "langfuse_eval_received",
      seed_id: evalEvent.seedId,
      data: {
        score_name: evalEvent.scoreName,
        score_value: evalEvent.scoreValue,
        trace_id: evalEvent.traceId,
        correlation_id: evalEvent.correlationId,
        metadata: evalEvent.metadata,
      },
    });
  }

  if (!baseSeed) {
    return {
      ...base,
      ok: false,
      action: "ticket",
      reason: evalEvent.seedId
        ? `No lineage seed found for seed_id=${evalEvent.seedId}`
        : "Missing seed_id in Langfuse metadata — set metadata.seed_id on the trace",
      error: "seed_not_found",
    };
  }

  const proposal = buildSeedRevisionProposal(evalEvent, baseSeed, options.minScore);

  if (proposal.action === "ticket") {
    return {
      ...base,
      ok: true,
      action: "ticket",
      reason: proposal.reason,
      proposal,
    };
  }

  if (dryRun || !proposal.patch) {
    if (evalEvent.seedId && options.eventStore) {
      await options.eventStore.append({
        type: "seed_revision_proposed",
        seed_id: evalEvent.seedId,
        data: {
          patch: proposal.patch,
          rationale: proposal.rationale,
          dry_run: true,
          score_name: evalEvent.scoreName,
          score_value: evalEvent.scoreValue,
        },
      });
    }
    return {
      ...base,
      ok: true,
      action: "proposed",
      reason: `${proposal.reason} (dry-run — set CLAWQL_LANGFUSE_EVAL_AUTO_APPLY=1 to apply)`,
      proposal,
    };
  }

  const revisedSeed = applyPatchToSeed(baseSeed, proposal.patch);
  const rootId = evalEvent.seedId ?? baseSeed.metadata.seed_id;

  if (options.eventStore) {
    await options.eventStore.append({
      type: "seed_revision_proposed",
      seed_id: rootId,
      data: {
        patch: proposal.patch,
        rationale: proposal.rationale,
        dry_run: false,
        score_name: evalEvent.scoreName,
        score_value: evalEvent.scoreValue,
      },
    });
    await options.eventStore.append({
      type: "seed_revision_applied",
      seed_id: rootId,
      data: {
        revised_seed: revisedSeed,
        parent_seed_id: baseSeed.metadata.seed_id,
        score_name: evalEvent.scoreName,
        score_value: evalEvent.scoreValue,
      },
    });
  }

  return {
    ...base,
    ok: true,
    action: "applied",
    reason: proposal.reason,
    proposal,
    revisedSeed,
    seedId: revisedSeed.metadata.seed_id,
  };
}
