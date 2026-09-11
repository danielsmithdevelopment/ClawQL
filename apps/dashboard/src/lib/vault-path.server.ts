import { homedir } from 'node:os'
import { relative, resolve } from 'node:path'

/** Same env as ClawQL MCP — Obsidian vault root (Memory/, memory.db, Dashboard/). */
export function getObsidianVaultRoot(): string {
  const raw = process.env.CLAWQL_OBSIDIAN_VAULT_PATH?.trim()
  if (raw) return resolve(raw)
  return resolve(homedir(), '.ClawQL')
}

function assertInsideVault(vaultRoot: string, absolutePath: string): void {
  const root = resolve(vaultRoot)
  const target = resolve(absolutePath)
  if (target === root) {
    return
  }
  const rel = relative(root, target)
  if (rel.startsWith('..') || rel === '..') {
    throw new Error(`Path escapes vault root: ${absolutePath}`)
  }
}

/** Resolve a path relative to the vault root; rejects `..` segments (matches clawql-memory). */
export function resolveVaultPath(vaultRoot: string, relativePath: string): string {
  const root = resolve(vaultRoot)
  const cleaned = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!cleaned || cleaned.split('/').some((p) => p === '..')) {
    throw new Error(`Invalid vault relative path: ${relativePath}`)
  }
  const full = resolve(root, cleaned)
  assertInsideVault(root, full)
  return full
}
