import { NextResponse } from 'next/server'

import {
  readLocalSourcesFile,
  removeLocalSource,
  upsertLocalSource,
  type LocalCustomSourceEntry,
} from '@/lib/local-sources-vault.server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const file = await readLocalSourcesFile()
  return NextResponse.json({ sources: file.sources })
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<LocalCustomSourceEntry>
  if (!body.id || !body.name || !body.kind) {
    return NextResponse.json({ error: 'id, name, and kind are required' }, { status: 400 })
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
