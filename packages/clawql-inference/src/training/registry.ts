import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DomainAdapterRecord, DomainAdapterTierMap } from "./types.js";
import { Effect } from "effect";

const FILE_NAME = "tier-map.adapters.json";

export function resolveDomainAdapterMapPath(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.CLAWQL_HOME?.trim() || join(process.cwd(), ".clawql");
  return join(home, "Inference", FILE_NAME);
}

async function loadDomainAdapterMapImpl(
  env: NodeJS.ProcessEnv = process.env
): Promise<DomainAdapterTierMap> {
  try {
    const raw = await readFile(resolveDomainAdapterMapPath(env), "utf8");
    return (JSON.parse(raw) as DomainAdapterTierMap) ?? {};
  } catch {
    return {};
  }
}

export function loadDomainAdapterMapEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<DomainAdapterTierMap, Error> {
  return Effect.tryPromise({
    try: () => loadDomainAdapterMapImpl(env),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link loadDomainAdapterMapEffect} for Effect callers. */
export async function loadDomainAdapterMap(
  env: NodeJS.ProcessEnv = process.env
): Promise<DomainAdapterTierMap> {
  return Effect.runPromise(loadDomainAdapterMapEffect(env));
}

async function saveDomainAdapterMapImpl(
  map: DomainAdapterTierMap,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const path = resolveDomainAdapterMapPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(map, null, 2)}\n`, "utf8");
  return path;
}

export function saveDomainAdapterMapEffect(
  map: DomainAdapterTierMap,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string, Error> {
  return Effect.tryPromise({
    try: () => saveDomainAdapterMapImpl(map, env),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link saveDomainAdapterMapEffect} for Effect callers. */
export async function saveDomainAdapterMap(
  map: DomainAdapterTierMap,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  return Effect.runPromise(saveDomainAdapterMapEffect(map, env));
}

export type PromoteDomainAdapterInput = {
  domain: string;
  version: string;
  adapter: DomainAdapterRecord;
  tier?: "frugal" | "standard" | "frontier";
  env?: NodeJS.ProcessEnv;
};

/** Promote (or replace) a domain adapter; previous path retained for rollback. */
async function promoteDomainAdapterImpl(
  input: PromoteDomainAdapterInput
): Promise<{ path: string; map: DomainAdapterTierMap }> {
  const env = input.env ?? process.env;
  const tier = input.tier ?? "frugal";
  const map = await loadDomainAdapterMap(env);
  const tierBlock = map[tier] ?? { base: undefined, adapters: {} };
  const adapters = { ...(tierBlock.adapters ?? {}) };
  const existing = adapters[input.domain];
  const next: DomainAdapterRecord = {
    ...input.adapter,
    previousPath:
      existing && typeof existing === "object" ? existing.path : input.adapter.previousPath,
    promotedAt: input.adapter.promotedAt ?? new Date().toISOString(),
  };
  adapters[input.domain] = next;
  map[tier] = { ...tierBlock, adapters };
  const path = await saveDomainAdapterMap(map, env);
  return { path, map };
}

export function promoteDomainAdapterEffect(
  input: PromoteDomainAdapterInput
): Effect.Effect<{ path: string; map: DomainAdapterTierMap }, Error> {
  return Effect.tryPromise({
    try: () => promoteDomainAdapterImpl(input),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link promoteDomainAdapterEffect} for Effect callers. */
export async function promoteDomainAdapter(
  input: PromoteDomainAdapterInput
): Promise<{ path: string; map: DomainAdapterTierMap }> {
  return Effect.runPromise(promoteDomainAdapterEffect(input));
}

async function rollbackDomainAdapterImpl(
  domain: string,
  options?: { tier?: "frugal" | "standard" | "frontier"; env?: NodeJS.ProcessEnv }
): Promise<{ path: string; map: DomainAdapterTierMap; rolledBack: boolean }> {
  const env = options?.env ?? process.env;
  const tier = options?.tier ?? "frugal";
  const map = await loadDomainAdapterMap(env);
  const adapters = { ...(map[tier]?.adapters ?? {}) };
  const current = adapters[domain];
  if (!current || typeof current !== "object" || !current.previousPath) {
    return { path: resolveDomainAdapterMapPath(env), map, rolledBack: false };
  }
  adapters[domain] = {
    ...current,
    path: current.previousPath,
    previousPath: current.path,
    promotedAt: new Date().toISOString(),
  };
  map[tier] = { ...(map[tier] ?? {}), adapters };
  const path = await saveDomainAdapterMap(map, env);
  return { path, map, rolledBack: true };
}

export function rollbackDomainAdapterEffect(
  domain: string,
  options?: { tier?: "frugal" | "standard" | "frontier"; env?: NodeJS.ProcessEnv }
): Effect.Effect<{ path: string; map: DomainAdapterTierMap; rolledBack: boolean }, Error> {
  return Effect.tryPromise({
    try: () => rollbackDomainAdapterImpl(domain, options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link rollbackDomainAdapterEffect} for Effect callers. */
export async function rollbackDomainAdapter(
  domain: string,
  options?: { tier?: "frugal" | "standard" | "frontier"; env?: NodeJS.ProcessEnv }
): Promise<{ path: string; map: DomainAdapterTierMap; rolledBack: boolean }> {
  return Effect.runPromise(rollbackDomainAdapterEffect(domain, options));
}

export function listDomainAdapters(
  map: DomainAdapterTierMap,
  domain?: string,
  tier: "frugal" | "standard" | "frontier" = "frugal"
): Record<string, DomainAdapterRecord | null> {
  const adapters = map[tier]?.adapters ?? {};
  if (!domain) return adapters;
  return { [domain]: adapters[domain] ?? null };
}
