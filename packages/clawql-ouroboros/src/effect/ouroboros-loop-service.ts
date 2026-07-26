import { Context, Effect, Layer } from "effect";
import { SeedSchema } from "../seed.js";
import type { Seed } from "../seed.js";
import type { ConvergenceConfig } from "../convergence.js";
import type { LoopResult } from "../evolutionary-loop.js";
import { buildEvolutionaryLoop } from "../glue/build-evolutionary-loop.js";
import { OuroborosError } from "./ouroboros-errors.js";
import { runEvolutionaryLoopBodyEffect } from "./evolutionary-loop-effect.js";

let builtLoopCache: ReturnType<typeof buildEvolutionaryLoop> | null = null;

function getBuiltLoop(): ReturnType<typeof buildEvolutionaryLoop> {
  if (!builtLoopCache) {
    builtLoopCache = buildEvolutionaryLoop();
  }
  return builtLoopCache;
}

/** Vitest: clear cached loop bundle. */
export function resetOuroborosLoopDepsForTests(): void {
  builtLoopCache = null;
}

/** Effect service for the Ouroboros evolutionary loop. */
export class OuroborosLoopService extends Context.Tag("clawql/OuroborosLoopService")<
  OuroborosLoopService,
  {
    readonly run: (
      seed: Seed,
      runOverrides?: Partial<ConvergenceConfig>
    ) => Effect.Effect<LoopResult, OuroborosError>;
    readonly getLoop: () => ReturnType<typeof buildEvolutionaryLoop>["loop"];
  }
>() {}

export function ouroborosLoopLiveLayer(): Layer.Layer<OuroborosLoopService> {
  return Layer.succeed(
    OuroborosLoopService,
    OuroborosLoopService.of({
      run: (seed, runOverrides) =>
        runEvolutionaryLoopBodyEffect(getBuiltLoop().loop.loopDeps(), seed, runOverrides),
      getLoop: () => getBuiltLoop().loop,
    })
  );
}

export type RunOuroborosMcpInput = {
  seed: unknown;
  maxGenerations?: number;
  convergenceThreshold?: number;
};

/** Map loop result to MCP tool response shape. */
export function formatRunEvolutionaryLoopMcpResult(
  result: LoopResult,
  opts?: { maxGenerations?: number }
) {
  const cap = opts?.maxGenerations;
  const capNote = typeof cap === "number" ? ` (cap=${cap})` : "";
  return {
    converged: result.converged,
    generations: result.generations.length,
    finalSeed: result.finalSeed,
    lineageId: result.lineage.seed_id,
    status: result.lineage.status,
    summary: result.converged
      ? `Converged in ${result.generations.length} generation(s)${capNote}`
      : `Exhausted ${result.generations.length} generation(s) without convergence${capNote}`,
  };
}

/** MCP run_evolutionary_loop input → Effect program. */
export function executeRunEvolutionaryLoopFromInputEffect(
  input: RunOuroborosMcpInput
): Effect.Effect<
  ReturnType<typeof formatRunEvolutionaryLoopMcpResult>,
  OuroborosError,
  OuroborosLoopService
> {
  return Effect.gen(function* () {
    const loopSvc = yield* OuroborosLoopService;
    const validatedSeed = SeedSchema.parse(input.seed);
    // OpenBench spend guard: optional hard ceiling on evolutionary generations.
    const envCapRaw = process.env.CLAWQL_OUROBOROS_MAX_GENERATIONS?.trim();
    const envCap = envCapRaw ? Number.parseInt(envCapRaw, 10) : NaN;
    let maxGenerations = input.maxGenerations;
    if (Number.isFinite(envCap) && envCap >= 1) {
      const capped = Math.min(50, envCap);
      maxGenerations =
        typeof maxGenerations === "number"
          ? Math.min(maxGenerations, capped)
          : capped;
    }
    const result = yield* loopSvc.run(validatedSeed, {
      maxGenerations,
      convergenceThreshold: input.convergenceThreshold,
    });
    return formatRunEvolutionaryLoopMcpResult(result, { maxGenerations });
  });
}
