'use client'

import { IdpAttachmentList } from '@/components/agent-chat/IdpAttachmentCards'
import { ToolStepsPanel } from '@/components/agent-chat/ToolStepsPanel'
import type { ChatMessage } from '@/components/dashboard/types'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Marker, MarkerContent } from '@/components/ui/marker'
import { Message, MessageAvatar, MessageContent, MessageHeader } from '@/components/ui/message'
import { cn } from '@/lib/utils'

function AgentStatusBadge({ status }: { status: 'running' | 'queued' | 'done' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase',
        status === 'running' && 'bg-orange-500/15 text-orange-400',
        status === 'queued' && 'bg-zinc-800 text-zinc-500',
        status === 'done' && 'bg-zinc-800 text-zinc-400',
      )}
    >
      {status === 'running' ? (
        <>
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-orange-400 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-orange-500" />
          </span>
          streaming
        </>
      ) : status === 'queued' ? (
        'queued'
      ) : (
        'done'
      )}
    </span>
  )
}

export function ChatMessageRow({ message }: { message: ChatMessage }) {
  if (message.kind === 'user') {
    return (
      <Message align="end" className="max-w-[min(100%,42rem)] self-end">
        <MessageContent>
          <Bubble align="end" variant="secondary">
            <BubbleContent className="rounded-2xl rounded-tr-md bg-zinc-800 text-zinc-100">
              {message.text}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    )
  }

  const attachments = [...(message.attachments ?? []), ...(message.citations ?? [])]

  return (
    <Message align="start" className="max-w-[min(100%,42rem)]">
      <MessageAvatar>
        <Avatar className="size-8 border border-orange-500/30 bg-orange-500/15">
          <AvatarFallback className="bg-transparent text-[10px] font-bold text-orange-400">C</AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent>
        <MessageHeader className="gap-2 px-0">
          <span className="font-medium text-zinc-300">claw — agent</span>
          <AgentStatusBadge status={message.status} />
        </MessageHeader>
        <Bubble variant="ghost" className="max-w-full">
          <BubbleContent className="px-0 text-sm leading-relaxed text-zinc-200">
            {message.intro ? (
              <p className="whitespace-pre-wrap">{message.intro}</p>
            ) : message.status === 'running' ? (
              <Marker>
                <MarkerContent className="shimmer text-zinc-500">Generating response…</MarkerContent>
              </Marker>
            ) : null}
          </BubbleContent>
        </Bubble>
        {message.pipelineStatus?.phases?.length ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {message.pipelineStatus.phases.map((phase) => (
              <span
                key={phase}
                className="rounded-md border border-white/10 bg-zinc-900/80 px-2 py-0.5 font-mono text-[10px] text-zinc-400"
              >
                {phase}
              </span>
            ))}
          </div>
        ) : null}
        <IdpAttachmentList attachments={attachments} />
        {message.steps && message.steps.length > 0 ? (
          <ToolStepsPanel steps={message.steps} active={message.status === 'running'} />
        ) : null}
      </MessageContent>
    </Message>
  )
}
