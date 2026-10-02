import { existsSync, readFileSync } from "node:fs";
import { loadSpecEffect } from "clawql-api";
import { getObsidianVaultPath } from "clawql-memory/vault/config";
import { Effect } from "effect";
import { inferSpecMode } from "../onboarding/spec-mode.js";
import { getClawqlHome, getLocalProvidersVaultPath } from "../onboarding/paths.js";

export type StartupSummary = {
  specMode: string;
  vendorCount: number;
  vendors: string[];
  memoryVault: string | null;
  providerSecrets: number;
  providerVaultPath: string | null;
};

export function countLocalProviderSecrets(): number {
  const path = getLocalProvidersVaultPath();
  if (!existsSync(path)) return 0;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.values(parsed).filter((v) => typeof v === "string" && v.trim()).length;
  } catch {
    return 0;
  }
}

export function buildStartupSummaryEffect(): Effect.Effect<StartupSummary, Error> {
  return Effect.gen(function* () {
    const spec = yield* loadSpecEffect();
    const vendors = [
      ...new Set(spec.operations.map((o) => o.specLabel).filter(Boolean)),
    ] as string[];
    vendors.sort();

    const home = getClawqlHome();
    const vaultPath = getLocalProvidersVaultPath();
    const hasVaultFile = existsSync(vaultPath);

    return {
      specMode: inferSpecMode(),
      vendorCount: vendors.length,
      vendors: vendors.slice(0, 12),
      memoryVault: getObsidianVaultPath() ?? (existsSync(home) ? home : null),
      providerSecrets: countLocalProviderSecrets(),
      providerVaultPath: hasVaultFile ? vaultPath : null,
    };
  });
}

/** Promise façade — prefer {@link buildStartupSummaryEffect}. */
export async function buildStartupSummary(): Promise<StartupSummary> {
  return Effect.runPromise(buildStartupSummaryEffect());
}

export function formatStartupSummary(summary: StartupSummary): string {
  const vendorPreview =
    summary.vendors.length > 0
      ? summary.vendors.join(", ") + (summary.vendorCount > summary.vendors.length ? ", …" : "")
      : "none";
  const mem = summary.memoryVault ? `memory=${summary.memoryVault}` : "memory=off";
  const secrets = summary.providerSecrets
    ? `providerSecrets=${summary.providerSecrets} (${summary.providerVaultPath})`
    : "providerSecrets=0 (run: clawql init --interactive)";
  return (
    `[clawql-mcp] Ready — ${summary.specMode}; ` +
    `${summary.vendorCount} vendor label(s): ${vendorPreview}; ${mem}; ${secrets}`
  );
}

export function logStartupSummaryEffect(): Effect.Effect<void> {
  return buildStartupSummaryEffect().pipe(
    Effect.map((summary) => {
      console.error(formatStartupSummary(summary));
    }),
    Effect.catch((e: unknown) =>
      Effect.sync(() => {
        console.error(
          "[clawql-mcp] Startup summary unavailable:",
          e instanceof Error ? e.message : e
        );
      })
    )
  );
}

/** Promise façade for MCP process start. */
export async function logStartupSummary(): Promise<void> {
  return Effect.runPromise(logStartupSummaryEffect());
}
