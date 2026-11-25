import { NextResponse } from 'next/server'

import { chatStreamEnabled, openclawChatUrl } from '@/lib/agent-chat-upstream.server'
import { requireManagedApiSession } from '@/lib/api-auth'

export async function GET(req: Request) {
  const auth = await requireManagedApiSession(req)
  if (!auth.ok) return auth.response

  const url = openclawChatUrl()
  return NextResponse.json({
    openclawConfigured: Boolean(url && url.length > 0),
    chatStream: chatStreamEnabled(),
  })
}
