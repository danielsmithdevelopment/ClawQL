import { NextResponse } from 'next/server'

import { isDesktopMode } from '@/lib/desktop-mode'
import { addLocalSourceFromInput } from '@/lib/local-sources-add.server'
import type { LocalCustomSourceEntry } from '@/lib/custom-sources-types'
import {
  getLocalSourcesFilePath,
  readLocalSourcesFile,
  removeLocalSource,
  upsertLocalSource,
} from '@/lib/local-sources-vault.server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function desktopOnly() {
  if (!isDesktopMode()) {
    return NextResponse.json(
      { error: 'Local custom sources API is only available in ClawQL Desktop mode.' },
      { status: 403 },
    )
  }
  return null
}

export async function GET() {
  const denied = desktopOnly()
  if (denied) return denied

  const file = await readLocalSourcesFile()
  return NextResponse.json({
    sources: file.sources,
    sourcesPath: getLocalSourcesFilePath(),
  })
}

type AddBody = {
  url?: string
  name?: string
  kind?: string
  id?: string
  command?: string
  args?: string[]
  graphqlEndpoint?: string
  grpcEndpoint?: string
  protoPath?: string
  mcpUrl?: string
}

export async function POST(request: Request) {
  const denied = desktopOnly()
  if (denied) return denied

  const body = (await request.json()) as Partial<LocalCustomSourceEntry> & AddBody

  if (body.url?.trim() || body.command?.trim()) {
    try {
      const { path, entry } = await addLocalSourceFromInput({
        url: body.url,
        name: body.name,
        kind: body.kind as LocalCustomSourceEntry['kind'] | undefined,
        id: body.id,
        command: body.command,
        args: body.args,
        graphqlEndpoint: body.graphqlEndpoint,
        grpcEndpoint: body.grpcEndpoint,
        protoPath: body.protoPath,
        mcpUrl: body.mcpUrl,
      })
      return NextResponse.json({ ok: true, path, entry })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  }

  if (!body.id || !body.name || !body.kind) {
    return NextResponse.json({ error: 'url, command, or id+name+kind are required' }, { status: 400 })
  }

  const entry: LocalCustomSourceEntry = {
    id: String(body.id),
    name: String(body.name),
    kind: body.kind,
    addedAt: body.addedAt ?? new Date().toISOString(),
    ...body,
  }
  const path = await upsertLocalSource(entry)
  return NextResponse.json({ ok: true, path, entry })
}

export async function DELETE(request: Request) {
  const denied = desktopOnly()
  if (denied) return denied

  const url = new URL(request.url)
  const id = url.searchParams.get('id')?.trim()
  if (!id) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 })
  }
  const ok = await removeLocalSource(id)
  if (!ok) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
