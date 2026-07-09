import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { LocalCustomSourceEntry, LocalCustomSourcesFile } from '@/lib/custom-sources-types'
import { getObsidianVaultRoot } from '@/lib/vault-path.server'

export type { LocalCustomSourceEntry, LocalCustomSourceKind, LocalCustomSourcesFile } from '@/lib/custom-sources-types'

const FILE_MODE = 0o600

export function getLocalSourcesFilePath(): string {
  return join(getObsidianVaultRoot(), 'sources.json')
}

export async function readLocalSourcesFile(): Promise<LocalCustomSourcesFile> {
  const path = getLocalSourcesFilePath()
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { version: 1, sources: [] }
    }
    const o = parsed as Partial<LocalCustomSourcesFile>
    return { version: 1, sources: Array.isArray(o.sources) ? o.sources : [] }
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') return { version: 1, sources: [] }
    throw e
  }
}

export async function writeLocalSourcesFile(file: LocalCustomSourcesFile): Promise<string> {
  const path = getLocalSourcesFilePath()
  await mkdir(getObsidianVaultRoot(), { recursive: true })
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, {
    encoding: 'utf8',
    mode: FILE_MODE,
  })
  await chmod(path, FILE_MODE)
  return path
}

export async function upsertLocalSource(entry: LocalCustomSourceEntry): Promise<string> {
  const file = await readLocalSourcesFile()
  const idx = file.sources.findIndex((s) => s.id === entry.id)
  if (idx >= 0) file.sources[idx] = entry
  else file.sources.push(entry)
  return writeLocalSourcesFile(file)
}

export async function removeLocalSource(id: string): Promise<boolean> {
  const file = await readLocalSourcesFile()
  const next = file.sources.filter((s) => s.id !== id)
  if (next.length === file.sources.length) return false
  await writeLocalSourcesFile({ version: 1, sources: next })
  return true
}
