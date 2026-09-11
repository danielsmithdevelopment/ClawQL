import { NextResponse } from 'next/server'

import { chatStreamEnabled, openclawChatUrl } from '@/lib/agent-chat-upstream.server'

export function GET() {
  const url = openclawChatUrl()
  return NextResponse.json({
    openclawConfigured: Boolean(url && url.length > 0),
    chatStream: chatStreamEnabled(),
  })
}
