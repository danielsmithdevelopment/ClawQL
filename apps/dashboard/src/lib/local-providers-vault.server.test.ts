import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  applyLocalProviderEnvChanges,
  readLocalProvidersVaultData,
} from './local-providers-vault.server'

describe('local-providers-vault.server', () => {
  let home: string
  const prev = process.env.CLAWQL_OBSIDIAN_VAULT_PATH

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'clawql-desktop-vault-'))
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = home
  })

  afterEach(async () => {
    if (prev === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = prev
    await rm(home, { recursive: true, force: true })
  })

  it('writes and reads provider vault as env keys', async () => {
    await applyLocalProviderEnvChanges({ CLAWQL_GITHUB_TOKEN: 'ghp_test' }, [])
    const { data } = await readLocalProvidersVaultData()
    const { vaultProviderDataToEnv } = await import('./provider-vault-catalog')
    const env = vaultProviderDataToEnv(data)
    expect(env.CLAWQL_GITHUB_TOKEN).toBe('ghp_test')
    const raw = await readFile(join(home, 'vault', 'providers.json'), 'utf8')
    expect(raw).toContain('githubToken')
  })
})
