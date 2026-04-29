/**
 * Obsidian vault path from CLAWQL_OBSIDIAN_VAULT_PATH (optional).
 * When set, the MCP server validates the path at startup.
 */

import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { resolve } from "node:path";

/** Default mount path in Docker / NAS deployments. */
export const DEFAULT_OBSIDIAN_VAULT_PATH = "/vault";

export type VaultStartupStatus = {
  configured: boolean;
  path: string | null;
  writable: boolean;
  degraded: boolean;
  error?: string;
  fixCommand?: string;
};

let vaultStartupStatus: VaultStartupStatus = {
  configured: false,
  path: null,
  writable: true,
  degraded: false,
};

/**
 * Resolved Obsidian vault directory, or `null` if vault integration is disabled
 * (`CLAWQL_OBSIDIAN_VAULT_PATH` unset or empty).
 */
export function getObsidianVaultPath(): string | null {
  const raw = process.env.CLAWQL_OBSIDIAN_VAULT_PATH?.trim();
  if (raw === undefined || raw === "") {
    return null;
  }
  return resolve(raw);
}

/**
 * Ensures the vault path exists, is a directory, and is readable + writable.
 * No-op when vault is not configured.
 */
export async function validateObsidianVaultAtStartup(): Promise<void> {
  const vault = getObsidianVaultPath();
  if (vault === null) {
    return;
  }
  let st;
  try {
    st = await stat(vault);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `CLAWQL_OBSIDIAN_VAULT_PATH: path does not exist or is inaccessible: ${vault} (${msg})`,
      { cause: e }
    );
  }
  if (!st.isDirectory()) {
    throw new Error(`CLAWQL_OBSIDIAN_VAULT_PATH: not a directory: ${vault}`);
  }
  try {
    await access(vault, constants.R_OK | constants.W_OK);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`CLAWQL_OBSIDIAN_VAULT_PATH: not readable/writable: ${vault} (${msg})`, {
      cause: e,
    });
  }
  console.error(`[clawql-mcp] Obsidian vault: ${vault}`);
}

function defaultVaultPermissionFixHint(vault: string): string {
  if (vault === "/vault") {
    return 'mkdir -p "$HOME/.ClawQL/Memory" && chmod -R u+rwX,g+rwX "$HOME/.ClawQL"';
  }
  return `mkdir -p "${vault}" && chmod -R u+rwX,g+rwX "${vault}"`;
}

export function getVaultStartupStatus(): VaultStartupStatus {
  return vaultStartupStatus;
}

/**
 * Validate vault permissions. If unavailable, keep server booting but disable memory tools.
 */
export async function validateOrDegradeObsidianVaultAtStartup(): Promise<void> {
  const vault = getObsidianVaultPath();
  if (vault === null) {
    vaultStartupStatus = {
      configured: false,
      path: null,
      writable: true,
      degraded: false,
    };
    return;
  }
  try {
    await validateObsidianVaultAtStartup();
    vaultStartupStatus = {
      configured: true,
      path: vault,
      writable: true,
      degraded: false,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const fix = defaultVaultPermissionFixHint(vault);
    vaultStartupStatus = {
      configured: true,
      path: vault,
      writable: false,
      degraded: true,
      error: msg,
      fixCommand: fix,
    };
    // Keep MCP reachable for non-memory tools.
    process.env.CLAWQL_ENABLE_MEMORY = "0";
    console.error(
      `[clawql-mcp] Vault disabled for this run: ${msg}. Memory tools are unavailable. ` +
        `Fix path permissions, then restart. Suggested fix: ${fix}`
    );
  }
}
