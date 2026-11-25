import { NextResponse } from 'next/server'

import {
  maskProviderValues,
  requireDesktopApiAuth,
} from '@/lib/api-auth'
import { isDesktopMode } from '@/lib/desktop-mode'
import {
  applyLocalProviderEnvChanges,
  readLocalProvidersVaultData,
} from '@/lib/local-providers-vault.server'
import { providerCatalogEnvKeys, vaultProviderDataToEnv } from '@/lib/provider-vault-catalog'

export const runtime = 'nodejs'

function desktopOnly() {
  if (!isDesktopMode()) {
    return NextResponse.json(
      { error: 'Local provider vault API is only available in ClawQL Desktop mode.' },
      { status: 403 },
    )
  }
  return null
}

export async function GET(req: Request) {
  const denied = desktopOnly()
  if (denied) return denied
  const authDenied = requireDesktopApiAuth(req)
  if (authDenied) return authDenied

  try {
    const { path, data } = await readLocalProvidersVaultData()
    const values = vaultProviderDataToEnv(data)
    return NextResponse.json({
      // Masked only — vault is write-oriented from the UI (audit 8.02).
      values: maskProviderValues(values),
      vaultPath: path,
      found: Object.keys(data).length > 0,
      masked: true,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'vault read failed', detail: msg }, { status: 502 })
  }
}

type Body = {
  values?: Record<string, string>
  removeKeys?: string[]
}

export async function POST(req: Request) {
  const denied = desktopOnly()
  if (denied) return denied
  const authDenied = requireDesktopApiAuth(req)
  if (authDenied) return authDenied

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const catalogKeys = new Set(providerCatalogEnvKeys())
  const literals: Record<string, string> = {}
  for (const [k, v] of Object.entries(body.values ?? {})) {
    if (!catalogKeys.has(k)) continue
    if (typeof v !== 'string') continue
    // Ignore masked placeholders the UI may echo back.
    if (v.includes('•')) continue
    const t = v.trim()
    if (t !== '') literals[k] = v
  }

  const removeKeys = Array.isArray(body.removeKeys)
    ? body.removeKeys.filter((k): k is string => typeof k === 'string' && catalogKeys.has(k))
    : []

  if (Object.keys(literals).length === 0 && removeKeys.length === 0) {
    return NextResponse.json({ error: 'No changes to apply' }, { status: 400 })
  }

  try {
    const result = await applyLocalProviderEnvChanges(literals, removeKeys)
    return NextResponse.json({
      ok: true,
      vaultPath: result.path,
      values: maskProviderValues(result.values),
      masked: true,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'vault write failed', detail: msg }, { status: 502 })
  }
}
