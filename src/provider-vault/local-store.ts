/**
 * Local provider secrets vault — same KV property names as HashiCorp `secret/clawql/providers`.
 */

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getLocalProvidersVaultPath } from "../onboarding/paths.js";
import { buildProvidersVaultPayload, vaultProviderDataToEnv } from "./catalog.js";

const PROVIDERS_FILE_MODE = 0o600;

export type LocalProvidersVault = {
  readonly path: string;
  readonly data: Record<string, string>;
};

export async function readLocalProvidersVault(
  vaultPath = getLocalProvidersVaultPath()
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

export async function writeLocalProvidersVault(
  data: Record<string, string>,
  vaultPath = getLocalProvidersVaultPath()
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

export async function mergeEnvIntoLocalProvidersVault(
  env: Record<string, string>,
  vaultPath = getLocalProvidersVaultPath()
): Promise<LocalProvidersVault> {
  const incoming = buildProvidersVaultPayload(env);
  const existing = (await readLocalProvidersVault(vaultPath))?.data ?? {};
  const merged = { ...existing, ...incoming };
  await writeLocalProvidersVault(merged, vaultPath);
  return { path: vaultPath, data: merged };
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
