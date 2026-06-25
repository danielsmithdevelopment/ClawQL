import { homedir } from 'node:os'
import { resolve } from 'node:path'

/** Same env as ClawQL MCP — Obsidian vault root (Memory/, memory.db, Dashboard/). */
export function getObsidianVaultRoot(): string {
  const raw = process.env.CLAWQL_OBSIDIAN_VAULT_PATH?.trim()
  if (raw) return resolve(raw)
  return resolve(homedir(), '.ClawQL')
}
