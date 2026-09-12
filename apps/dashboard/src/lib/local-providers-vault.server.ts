import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  applyEnvChangesToVaultProviderData,
  vaultProviderDataToEnv,
} from '@/lib/provider-vault-catalog'
import { getObsidianVaultRoot } from '@/lib/vault-path.server'

const PROVIDERS_FILE_MODE = 0o600

export function getLocalProvidersVaultFilePath(): string {
  return join(getObsidianVaultRoot(), 'vault', 'providers.json')
}

export async function readLocalProvidersVaultData(): Promise<{
  path: string
  data: Record<string, string>
}> {
  const path = getLocalProvidersVaultFilePath()
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { path, data: {} }
    }
    const data: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) data[k] = v.trim()
    }
    return { path, data }
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') return { path, data: {} }
    throw e
  }
}

export async function writeLocalProvidersVaultData(data: Record<string, string>): Promise<string> {
  const path = getLocalProvidersVaultFilePath()
  await mkdir(join(getObsidianVaultRoot(), 'vault'), { recursive: true })
  const cleaned: Record<string, string> = {}
  for (const [k, v] of Object.entries(data)) {
    const t = v?.trim()
    if (t) cleaned[k] = t
  }
  await writeFile(path, `${JSON.stringify(cleaned, null, 2)}\n`, {
    encoding: 'utf8',
    mode: PROVIDERS_FILE_MODE,
  })
  await chmod(path, PROVIDERS_FILE_MODE)
  return path
}

export async function applyLocalProviderEnvChanges(
  literals: Record<string, string>,
  removeEnvKeys: string[],
): Promise<{ path: string; values: Record<string, string> }> {
  const current = (await readLocalProvidersVaultData()).data
  const nextVault = applyEnvChangesToVaultProviderData(current, literals, removeEnvKeys)
  const path = await writeLocalProvidersVaultData(nextVault)
  return { path, values: vaultProviderDataToEnv(nextVault) }
}
