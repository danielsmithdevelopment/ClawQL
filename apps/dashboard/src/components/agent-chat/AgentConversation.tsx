'use client'

import { MessageCircleDashedIcon } from 'lucide-react'

import { ChatMessageRow } from '@/components/agent-chat/ChatMessageRow'
import type { ChatMessage } from '@/components/dashboard/types'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'

export function AgentConversation({
  messages,
  isStreaming,
  loading,
}: {
  messages: ChatMessage[]
  isStreaming: boolean
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">Loading conversation…</div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900/80">
          <MessageCircleDashedIcon className="size-6 text-orange-400/80" />
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-200">Start an IDP workflow</p>
          <p className="mt-1 max-w-sm text-xs text-zinc-500">
            Ask Claw to process documents, search Onyx, archive to Paperless, or create a Coneshare room. History
            persists in your vault.
          </p>
        </div>
      </div>
    )
  }

  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller className="flex-1">
        <MessageScrollerViewport className="px-4 py-6 sm:px-6">
          <MessageScrollerContent aria-busy={isStreaming}>
            {messages.map((msg) => (
              <MessageScrollerItem key={msg.id} messageId={msg.id} scrollAnchor={msg.kind === 'user'}>
                <ChatMessageRow message={msg} />
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton variant="secondary" className="border-white/10 bg-zinc-900/95 shadow-lg" />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
