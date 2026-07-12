import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ModelTier } from "../routing/types.js";
import type { FallbackChainMap, FallbackConfig } from "./types.js";

const FILE_NAME = "fallback-chains.json";

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseModelList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function resolveFallbackChainsPath(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
  return join(home, "Inference", FILE_NAME);
}

export async function loadFallbackChainsFile(
  env: NodeJS.ProcessEnv = process.env
): Promise<Partial<FallbackChainMap>> {
  return loadFallbackChainsFileSync(env);
}

function loadFallbackChainsFileSync(
  env: NodeJS.ProcessEnv = process.env
): Partial<FallbackChainMap> {
  try {
    const path = resolveFallbackChainsPath(env);
    if (!existsSync(path)) return { byTier: {}, byModel: {} };
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<FallbackChainMap>;
    return {
      byTier: parsed.byTier ?? {},
      byModel: parsed.byModel ?? {},
    };
  } catch {
    return { byTier: {}, byModel: {} };
  }
}

export async function saveFallbackChainsFile(
  chains: FallbackChainMap,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const path = resolveFallbackChainsPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(chains, null, 2)}\n`, "utf8");
  return path;
}

function readTierChainsFromEnv(env: NodeJS.ProcessEnv): Partial<Record<ModelTier, string[]>> {
  const tiers: ModelTier[] = ["frugal", "standard", "frontier"];
  const byTier: Partial<Record<ModelTier, string[]>> = {};
  for (const tier of tiers) {
    const key = `CLAWQL_INFERENCE_FALLBACK_${tier.toUpperCase()}` as keyof NodeJS.ProcessEnv;
    const list = parseModelList(env[key]);
    if (list.length) byTier[tier] = list;
  }
  return byTier;
}

function mergeChains(base: FallbackChainMap, overlay: Partial<FallbackChainMap>): FallbackChainMap {
  return {
    byTier: { ...base.byTier, ...overlay.byTier },
    byModel: { ...base.byModel, ...overlay.byModel },
  };
}

export function loadFallbackConfig(env: NodeJS.ProcessEnv = process.env): FallbackConfig {
  const enabled = parseTruthy(env.CLAWQL_INFERENCE_FALLBACK_ENABLED);
  const envChains: FallbackChainMap = {
    byTier: readTierChainsFromEnv(env),
    byModel: {},
  };
  const file = loadFallbackChainsFileSync(env);
  return {
    enabled,
    chains: mergeChains(envChains, file),
  };
}

/** @deprecated Use {@link loadFallbackConfig} (sync). */
export async function loadFallbackConfigAsync(
  env: NodeJS.ProcessEnv = process.env
): Promise<FallbackConfig> {
  return loadFallbackConfig(env);
}

export function loadFallbackConfigSync(env: NodeJS.ProcessEnv = process.env): FallbackConfig {
  return loadFallbackConfig(env);
}
