/**
 * Obsidian vault path from CLAWQL_OBSIDIAN_VAULT_PATH (optional).
 */

import { resolve } from "node:path";

/** Default mount path in Docker / NAS deployments. */
export const DEFAULT_OBSIDIAN_VAULT_PATH = "/vault";

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
