import { describe, expect, it } from 'vitest'

import {
  applyEnvChangesToVaultProviderData,
  isProvidersVaultPath,
  resolveProviderEnvAlias,
  vaultProviderDataToEnv,
} from './provider-vault-catalog'

describe('provider-vault-catalog', () => {
  it('detects providers vault path', () => {
    expect(isProvidersVaultPath('clawql/providers')).toBe(true)
    expect(isProvidersVaultPath('/clawql/providers/')).toBe(true)
    expect(isProvidersVaultPath('clawql/dotenv')).toBe(false)
  })

  it('maps vault properties to env keys', () => {
    expect(
      vaultProviderDataToEnv({
        paperlessApiToken: 'tok',
        githubToken: 'gh',
      }),
    ).toEqual({
      PAPERLESS_API_TOKEN: 'tok',
      CLAWQL_GITHUB_TOKEN: 'gh',
    })
  })

  it('merges env literals into vault payload', () => {
    expect(
      applyEnvChangesToVaultProviderData(
        { paperlessApiToken: 'old' },
        { PAPERLESS_API_TOKEN: 'new', ONYX_API_TOKEN: 'onyx' },
        ['CLAWQL_GITHUB_TOKEN'],
      ),
    ).toEqual({
      paperlessApiToken: 'new',
      onyxApiToken: 'onyx',
    })
  })

  it('resolves env aliases for paste import', () => {
    expect(resolveProviderEnvAlias('GITHUB_TOKEN')).toBe('CLAWQL_GITHUB_TOKEN')
    expect(resolveProviderEnvAlias('SLACK_BOT_TOKEN')).toBe('CLAWQL_SLACK_TOKEN')
  })
})
