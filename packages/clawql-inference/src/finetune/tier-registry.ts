import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ModelTier, ModelTierMap } from "../routing/types.js";

export type TierMapOverrides = Partial<ModelTierMap>;

const FILE_NAME = "tier-map.json";

export function resolveTierMapPath(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
  return join(home, "Inference", FILE_NAME);
}

export async function loadTierMapOverrides(
  env: NodeJS.ProcessEnv = process.env
): Promise<TierMapOverrides> {
  try {
    const raw = await readFile(resolveTierMapPath(env), "utf8");
    const parsed = JSON.parse(raw) as TierMapOverrides;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export async function saveTierMapOverrides(
  overrides: TierMapOverrides,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const path = resolveTierMapPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(overrides, null, 2)}\n`, "utf8");
  return path;
}

export async function registerModelToTier(
  tier: ModelTier,
  modelId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ path: string; tierMap: TierMapOverrides }> {
  const current = await loadTierMapOverrides(env);
  const next = { ...current, [tier]: modelId };
  const path = await saveTierMapOverrides(next, env);
  return { path, tierMap: next };
}

export function mergeTierMap(base: ModelTierMap, overrides: TierMapOverrides): ModelTierMap {
  return {
    frugal: overrides.frugal ?? base.frugal,
    standard: overrides.standard ?? base.standard,
    frontier: overrides.frontier ?? base.frontier,
  };
}
