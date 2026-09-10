'use client'

import { Loader2, SendHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ChatComposer({
  input,
  sending,
  onInputChange,
  onSend,
}: {
  input: string
  sending: boolean
  onInputChange: (value: string) => void
  onSend: () => void
}) {
  return (
    <div className="shrink-0 border-t border-white/10 bg-zinc-950 p-3 sm:p-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-2">
        <div className="flex gap-2 rounded-xl border border-white/10 bg-zinc-900/80 p-2 shadow-inner">
          <Input
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
            placeholder="Message Claw… (process docs, search Onyx, create data room)"
            className="h-11 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
            disabled={sending}
          />
          <Button
            type="button"
            size="icon"
            className="shrink-0 bg-orange-500 text-zinc-950 hover:bg-orange-400"
            disabled={sending || !input.trim()}
            onClick={onSend}
            aria-label="Send"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
          </Button>
        </div>
        <p className="px-1 text-[10px] text-zinc-600">
          Streaming when OpenClaw bridge supports SSE · vault: Dashboard/chats/
        </p>
      </div>
    </div>
  )
}
