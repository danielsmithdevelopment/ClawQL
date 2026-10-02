import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Context, Effect, Layer } from "effect";
import type { ModelTier, ModelTierMap } from "../routing/types.js";

export type TierMapOverrides = Partial<ModelTierMap>;

const FILE_NAME = "tier-map.json";

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

export function resolveTierMapPath(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
  return join(home, "Inference", FILE_NAME);
}

export function loadTierMapOverridesEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<TierMapOverrides, Error> {
  return Effect.tryPromise({
    try: async () => {
      try {
        const raw = await readFile(resolveTierMapPath(env), "utf8");
        const parsed = JSON.parse(raw) as TierMapOverrides;
        return parsed ?? {};
      } catch {
        return {};
      }
    },
    catch: asError,
  });
}

/** Promise façade. */
export async function loadTierMapOverrides(
  env: NodeJS.ProcessEnv = process.env
): Promise<TierMapOverrides> {
  return Effect.runPromise(loadTierMapOverridesEffect(env));
}

export function saveTierMapOverridesEffect(
  overrides: TierMapOverrides,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string, Error> {
  return Effect.tryPromise({
    try: async () => {
      const path = resolveTierMapPath(env);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(overrides, null, 2)}\n`, "utf8");
      return path;
    },
    catch: asError,
  });
}

/** Promise façade. */
export async function saveTierMapOverrides(
  overrides: TierMapOverrides,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  return Effect.runPromise(saveTierMapOverridesEffect(overrides, env));
}

export function registerModelToTierEffect(
  tier: ModelTier,
  modelId: string,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<{ path: string; tierMap: TierMapOverrides }, Error> {
  return Effect.gen(function* () {
    const current = yield* loadTierMapOverridesEffect(env);
    const next = { ...current, [tier]: modelId };
    const path = yield* saveTierMapOverridesEffect(next, env);
    return { path, tierMap: next };
  });
}

/** Promise façade. */
export async function registerModelToTier(
  tier: ModelTier,
  modelId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ path: string; tierMap: TierMapOverrides }> {
  return Effect.runPromise(registerModelToTierEffect(tier, modelId, env));
}

export function mergeTierMap(base: ModelTierMap, overrides: TierMapOverrides): ModelTierMap {
  return {
    frugal: overrides.frugal ?? base.frugal,
    standard: overrides.standard ?? base.standard,
    frontier: overrides.frontier ?? base.frontier,
  };
}

export class FinetuneTierRegistryService extends Context.Service<
  FinetuneTierRegistryService,
  {
    readonly loadOverrides: (
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<TierMapOverrides, Error>;
    readonly saveOverrides: (
      overrides: TierMapOverrides,
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<string, Error>;
    readonly registerModel: (
      tier: ModelTier,
      modelId: string,
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<{ path: string; tierMap: TierMapOverrides }, Error>;
  }
>()("clawql/FinetuneTierRegistryService") {}

export function finetuneTierRegistryLiveLayer(): Layer.Layer<FinetuneTierRegistryService> {
  return Layer.succeed(
    FinetuneTierRegistryService,
    FinetuneTierRegistryService.of({
      loadOverrides: loadTierMapOverridesEffect,
      saveOverrides: saveTierMapOverridesEffect,
      registerModel: registerModelToTierEffect,
    })
  );
}
