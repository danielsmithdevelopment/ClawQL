import { Context, Effect, Layer } from "effect";
import type {
  EngineCallContext,
  EvaluationSummary,
  Evaluator,
  Executor,
  ReflectEngine,
  ReflectOutput,
  WonderEngine,
  WonderOutput,
} from "../interfaces.js";
import type { Seed } from "../seed.js";
import {
  createDefaultOuroborosEngines,
  type OuroborosToolBridge,
} from "../glue/default-engines.js";
import { getOuroborosPluginDeps } from "../plugin/deps.js";
import { OuroborosError } from "./ouroboros-errors.js";
import { ouroborosFromPromise } from "./ouroboros-effect-utils.js";

export type OuroborosEngines = {
  wonder: WonderEngine;
  reflect: ReflectEngine;
  execute: Executor;
  evaluate: Evaluator;
};

let enginesCache: OuroborosEngines | null = null;

/** Build tool bridge from plugin Search/Execute deps. */
export function buildOuroborosToolBridgeFromPluginDeps(): OuroborosToolBridge {
  const { search, execute } = getOuroborosPluginDeps();
  return {
    search: async (query, limit) => {
      const r = await search({ query, limit });
      return { content: [...r.content] };
    },
    execute: async (params) => {
      const r = await execute(params);
      return { content: [...r.content] };
    },
  };
}

/** Shared default engines singleton (search/execute deps must be configured). */
export function getOrCreateOuroborosEngines(): OuroborosEngines {
  if (!enginesCache) {
    enginesCache = createDefaultOuroborosEngines(buildOuroborosToolBridgeFromPluginDeps());
  }
  return enginesCache;
}

/** Vitest: clear cached engines so dep changes apply. */
export function resetOuroborosEnginesForTests(): void {
  enginesCache = null;
}

/** Effect service for Wonder / Reflect / Executor / Evaluator engines. */
export class OuroborosEnginesService extends Context.Tag("clawql/OuroborosEnginesService")<
  OuroborosEnginesService,
  {
    readonly getEngines: () => OuroborosEngines;
    readonly wonder: (
      seed: Seed,
      previousEvaluation?: EvaluationSummary,
      ctx?: EngineCallContext
    ) => Effect.Effect<WonderOutput, OuroborosError>;
    readonly reflect: (
      seed: Seed,
      executionOutput: string,
      evaluation: EvaluationSummary,
      wonder: WonderOutput,
      ctx?: EngineCallContext
    ) => Effect.Effect<ReflectOutput, OuroborosError>;
    readonly execute: (
      seed: Seed,
      ctx?: EngineCallContext
    ) => Effect.Effect<string, OuroborosError>;
    readonly evaluate: (
      executionOutput: string,
      seed: Seed,
      ctx?: EngineCallContext
    ) => Effect.Effect<EvaluationSummary, OuroborosError>;
  }
>() {}

export function ouroborosEnginesLiveLayer(): Layer.Layer<OuroborosEnginesService> {
  return Layer.succeed(
    OuroborosEnginesService,
    OuroborosEnginesService.of({
      getEngines: () => getOrCreateOuroborosEngines(),
      wonder: (seed, previousEvaluation, ctx) =>
        ouroborosFromPromise(() =>
          getOrCreateOuroborosEngines().wonder.wonder(seed, previousEvaluation, ctx)
        ),
      reflect: (seed, executionOutput, evaluation, wonder, ctx) =>
        ouroborosFromPromise(() =>
          getOrCreateOuroborosEngines().reflect.reflect(
            seed,
            executionOutput,
            evaluation,
            wonder,
            ctx
          )
        ),
      execute: (seed, ctx) =>
        ouroborosFromPromise(() => getOrCreateOuroborosEngines().execute.execute(seed, ctx)),
      evaluate: (executionOutput, seed, ctx) =>
        ouroborosFromPromise(() =>
          getOrCreateOuroborosEngines().evaluate.evaluate(executionOutput, seed, ctx)
        ),
    })
  );
}
