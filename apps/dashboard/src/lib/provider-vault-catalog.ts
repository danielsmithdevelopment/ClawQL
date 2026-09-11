import catalogDoc from '@/generated/provider-vault-catalog.json'

export type ProviderVaultCatalogEntry = {
  vaultProperty: string
  envKey: string
  envAliases: string[]
  label: string
  group: string
  hint?: string
}

export type ProviderVaultCatalog = {
  path: string
  entries: ProviderVaultCatalogEntry[]
}

export const providerVaultCatalog = catalogDoc as ProviderVaultCatalog

export const PROVIDERS_VAULT_KV_PATH = providerVaultCatalog.path

export function isProvidersVaultPath(logicalPath: string): boolean {
  return logicalPath.replace(/^\/+|\/+$/g, '') === PROVIDERS_VAULT_KV_PATH
}

export function vaultProviderDataToEnv(vaultData: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const entry of providerVaultCatalog.entries) {
    const v = vaultData[entry.vaultProperty]?.trim()
    if (v) out[entry.envKey] = v
  }
  return out
}

export function applyEnvChangesToVaultProviderData(
  currentVault: Record<string, string>,
  literals: Record<string, string>,
  removeEnvKeys: string[],
): Record<string, string> {
  const envToProp = new Map(providerVaultCatalog.entries.map((e) => [e.envKey, e.vaultProperty]))
  const next = { ...currentVault }
  for (const [envKey, value] of Object.entries(literals)) {
    const prop = envToProp.get(envKey)
    if (prop) next[prop] = value
  }
  for (const envKey of removeEnvKeys) {
    const prop = envToProp.get(envKey)
    if (prop) delete next[prop]
  }
  return next
}

export function providerCatalogEnvKeys(): string[] {
  return providerVaultCatalog.entries.map((e) => e.envKey)
}

export function resolveProviderEnvAlias(key: string): string | undefined {
  for (const entry of providerVaultCatalog.entries) {
    if (entry.envAliases.includes(key)) return entry.envKey
  }
  return undefined
}

export function providerCatalogSections(): { title: string; entries: ProviderVaultCatalogEntry[] }[] {
  const order: string[] = []
  const byGroup = new Map<string, ProviderVaultCatalogEntry[]>()
  for (const entry of providerVaultCatalog.entries) {
    if (!byGroup.has(entry.group)) {
      byGroup.set(entry.group, [])
      order.push(entry.group)
    }
    byGroup.get(entry.group)!.push(entry)
  }
  return order.map((title) => ({ title, entries: byGroup.get(title)! }))
}
