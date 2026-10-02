/**
 * Local provider secrets vault — same KV property names as HashiCorp `secret/clawql/providers`.
 */

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Effect } from "effect";
import { getLocalProvidersVaultPath } from "../onboarding/paths.js";
import { buildProvidersVaultPayload, vaultProviderDataToEnv } from "./catalog.js";

const PROVIDERS_FILE_MODE = 0o600;

export type LocalProvidersVault = {
  readonly path: string;
  readonly data: Record<string, string>;
};

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

async function readLocalProvidersVaultImpl(
  vaultPath: string
): Promise<LocalProvidersVault | null> {
  try {
    const raw = await readFile(vaultPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { path: vaultPath, data: {} };
    }
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) data[k] = v.trim();
    }
    return { path: vaultPath, data };
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return null;
    throw e;
  }
}

export function readLocalProvidersVaultEffect(
  vaultPath = getLocalProvidersVaultPath()
): Effect.Effect<LocalProvidersVault | null, Error> {
  return Effect.tryPromise({
    try: () => readLocalProvidersVaultImpl(vaultPath),
    catch: asError,
  });
}

/** Promise façade — prefer {@link readLocalProvidersVaultEffect}. */
export async function readLocalProvidersVault(
  vaultPath = getLocalProvidersVaultPath()
): Promise<LocalProvidersVault | null> {
  return Effect.runPromise(readLocalProvidersVaultEffect(vaultPath));
}

async function writeLocalProvidersVaultImpl(
  data: Record<string, string>,
  vaultPath: string
): Promise<void> {
  await mkdir(dirname(vaultPath), { recursive: true });
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    const t = v?.trim();
    if (t) cleaned[k] = t;
  }
  await writeFile(vaultPath, `${JSON.stringify(cleaned, null, 2)}\n`, {
    encoding: "utf8",
    mode: PROVIDERS_FILE_MODE,
  });
  await chmod(vaultPath, PROVIDERS_FILE_MODE);
}

export function writeLocalProvidersVaultEffect(
  data: Record<string, string>,
  vaultPath = getLocalProvidersVaultPath()
): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: () => writeLocalProvidersVaultImpl(data, vaultPath),
    catch: asError,
  });
}

/** Promise façade — prefer {@link writeLocalProvidersVaultEffect}. */
export async function writeLocalProvidersVault(
  data: Record<string, string>,
  vaultPath = getLocalProvidersVaultPath()
): Promise<void> {
  return Effect.runPromise(writeLocalProvidersVaultEffect(data, vaultPath));
}

export function mergeEnvIntoLocalProvidersVaultEffect(
  env: Record<string, string>,
  vaultPath = getLocalProvidersVaultPath()
): Effect.Effect<LocalProvidersVault, Error> {
  return Effect.gen(function* () {
    const incoming = buildProvidersVaultPayload(env);
    const existing = (yield* readLocalProvidersVaultEffect(vaultPath))?.data ?? {};
    const merged = { ...existing, ...incoming };
    yield* writeLocalProvidersVaultEffect(merged, vaultPath);
    return { path: vaultPath, data: merged };
  });
}

/** Promise façade — prefer {@link mergeEnvIntoLocalProvidersVaultEffect}. */
export async function mergeEnvIntoLocalProvidersVault(
  env: Record<string, string>,
  vaultPath = getLocalProvidersVaultPath()
): Promise<LocalProvidersVault> {
  return Effect.runPromise(mergeEnvIntoLocalProvidersVaultEffect(env, vaultPath));
}

/** Apply local vault secrets to `process.env` (does not override already-set keys). */
export function applyLocalProvidersVaultToEnv(vaultData: Record<string, string>): string[] {
  const applied: string[] = [];
  for (const [envKey, value] of Object.entries(vaultProviderDataToEnv(vaultData))) {
    if (!process.env[envKey]?.trim()) {
      process.env[envKey] = value;
      applied.push(envKey);
    }
  }
  return applied;
}

export function listConfiguredProviderLabels(vaultData: Record<string, string>): string[] {
  return Object.keys(vaultData).filter((k) => vaultData[k]?.trim());
}
