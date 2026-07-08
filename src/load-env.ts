/**
 * Load env in order (later file keys override earlier via dotenv override where noted):
 * 1. Package root `.env`
 * 2. `process.cwd()/.env` (override)
 * 3. `$CLAWQL_HOME/clawql.env` or `~/.ClawQL/clawql.env`
 * 4. Local provider vault `vault/providers.json` → env (vault-first; does not override set keys)
 *
 * When `~/.ClawQL` exists and CLAWQL_OBSIDIAN_VAULT_PATH is unset, default memory vault to home.
 */
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getClawqlEnvFilePath,
  getClawqlHome,
  getLocalProvidersVaultPath,
} from "./onboarding/paths.js";
import { applyLocalProvidersVaultToEnv } from "./provider-vault/local-store.js";

function loadEnvFile(path: string, override: boolean): void {
  if (!existsSync(path)) return;
  config({ path, override });
}

function loadLocalProvidersVaultSync(): void {
  const vaultPath = getLocalProvidersVaultPath();
  if (!existsSync(vaultPath)) return;
  try {
    const raw = readFileSync(vaultPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return;
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) data[k] = v.trim();
    }
    const applied = applyLocalProvidersVaultToEnv(data);
    if (applied.length && process.env.CLAWQL_DEBUG_LOAD_ENV === "1") {
      console.error(
        `[clawql-mcp] Loaded provider secrets from ${vaultPath}: ${applied.join(", ")}`
      );
    }
  } catch (e: unknown) {
    console.error(
      `[clawql-mcp] Failed to load local provider vault ${vaultPath}:`,
      e instanceof Error ? e.message : e
    );
  }
}

const here = dirname(fileURLToPath(import.meta.url));
loadEnvFile(resolve(here, "..", ".env"), false);
loadEnvFile(resolve(process.cwd(), ".env"), true);

const home = getClawqlHome();
loadEnvFile(getClawqlEnvFilePath(home), false);

if (!process.env.CLAWQL_OBSIDIAN_VAULT_PATH?.trim() && existsSync(home)) {
  process.env.CLAWQL_OBSIDIAN_VAULT_PATH = home;
}

loadLocalProvidersVaultSync();
