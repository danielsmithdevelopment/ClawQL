import { NextResponse } from 'next/server'

import { createChatThread, getChatVaultInfo, importChatThreadsFromLocal, listChatThreads } from '@/lib/chat-vault-store.server'

export async function GET() {
  try {
    const info = await getChatVaultInfo()
    const { threads, vaultRoot } = await listChatThreads()
    return NextResponse.json({
      vaultRoot,
      chatsRoot: info.chatsRoot,
      writable: info.writable,
      threads,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to list chats'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { title?: string }
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'New chat'
    const meta = await createChatThread(title)
    return NextResponse.json({
      thread: {
        id: meta.id,
        title: meta.title,
        updatedAt: new Date(meta.updatedAt).getTime(),
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create chat'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** One-time import from browser localStorage → vault files. */
export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as {
      threads?: Array<{ id: string; title: string; updatedAt: number }>
      messagesByThreadId?: Record<string, unknown[]>
    }
    if (!Array.isArray(body.threads)) {
      return NextResponse.json({ error: 'threads array required' }, { status: 400 })
    }
    const result = await importChatThreadsFromLocal({
      threads: body.threads,
      messagesByThreadId: (body.messagesByThreadId ?? {}) as Record<string, import('@/components/dashboard/types').ChatMessage[]>,
    })
    const { threads, vaultRoot } = await listChatThreads()
    return NextResponse.json({ imported: result.imported, vaultRoot, threads })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Import failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
