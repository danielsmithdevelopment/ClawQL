import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  cacheCustomSourceBody,
  detectSourceFromUrl,
  ensureSourceCacheDir,
  slugifySourceId,
  type CustomSourceKind,
} from 'clawql-api'

import type { LocalCustomSourceEntry, LocalCustomSourceKind } from '@/lib/custom-sources-types'
import { upsertLocalSource } from '@/lib/local-sources-vault.server'
import { getObsidianVaultRoot } from '@/lib/vault-path.server'

export type AddLocalSourceInput = {
  url?: string
  name?: string
  kind?: LocalCustomSourceKind
  id?: string
  command?: string
  args?: string[]
  graphqlEndpoint?: string
  grpcEndpoint?: string
  protoPath?: string
  mcpUrl?: string
}

function parseKind(raw: string | undefined): CustomSourceKind | undefined {
  if (!raw?.trim()) return undefined
  const k = raw.trim().toLowerCase()
  const allowed: CustomSourceKind[] = ['openapi', 'discovery', 'graphql', 'grpc', 'mcp', 'cli']
  if (allowed.includes(k as CustomSourceKind)) return k as CustomSourceKind
  throw new Error(`Unknown kind: ${raw}. Use ${allowed.join('|')}`)
}

export async function addLocalSourceFromInput(
  input: AddLocalSourceInput,
): Promise<{ path: string; entry: LocalCustomSourceEntry }> {
  const home = getObsidianVaultRoot()
  const kind = parseKind(input.kind)

  if (kind === 'cli' || input.command?.trim()) {
    const command = input.command?.trim()
    if (!command) {
      throw new Error('CLI sources require command')
    }
    const id = input.id?.trim() || slugifySourceId(input.name ?? command)
    const entry: LocalCustomSourceEntry = {
      id,
      name: input.name?.trim() || command,
      kind: 'cli',
      addedAt: new Date().toISOString(),
      cliCommand: command,
      cliArgs: input.args ?? [],
      cliDescription: `CLI: ${command}`,
    }
    const path = await upsertLocalSource(entry)
    return { path, entry }
  }

  const url = input.url?.trim()
  if (!url) {
    throw new Error('URL or CLI command is required')
  }

  const detected = await detectSourceFromUrl(url, { kindHint: kind })
  const id = input.id?.trim()
    ? slugifySourceId(input.id.trim())
    : slugifySourceId(input.name ?? detected.name ?? url)
  await ensureSourceCacheDir(id, home)

  let entry: LocalCustomSourceEntry = {
    id,
    name: input.name?.trim() || detected.name || id,
    kind: detected.kind as LocalCustomSourceKind,
    addedAt: new Date().toISOString(),
    url,
  }

  if (detected.kind === 'mcp') {
    entry = { ...entry, mcpUrl: input.mcpUrl?.trim() || url }
  } else if (detected.kind === 'graphql') {
    entry = {
      ...entry,
      graphqlEndpoint: input.graphqlEndpoint?.trim() || detected.graphqlEndpoint || url,
    }
    if (detected.bodyText) {
      entry = (await cacheCustomSourceBody(entry, detected.bodyText, home)) as LocalCustomSourceEntry
    }
  } else if (detected.kind === 'grpc') {
    const dir = await ensureSourceCacheDir(id, home)
    const protoAbs = join(dir, 'service.proto')
    if (detected.bodyText) {
      await writeFile(protoAbs, detected.bodyText, 'utf8')
    }
    entry = {
      ...entry,
      grpcEndpoint: input.grpcEndpoint?.trim() || 'localhost:50051',
      protoPath: input.protoPath?.trim() || `sources/${id}/service.proto`,
      grpcInsecure: true,
    }
  } else if (detected.bodyText) {
    entry = (await cacheCustomSourceBody(entry, detected.bodyText, home)) as LocalCustomSourceEntry
  }

  const path = await upsertLocalSource(entry)
  return { path, entry }
}
