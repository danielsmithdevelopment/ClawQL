'use client'

import {
  BrainIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  Loader2Icon,
  WrenchIcon,
} from 'lucide-react'

import type { ChatToolCall, ChatToolStep } from '@/components/dashboard/types'
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ui/code-block'
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace'

function stepStatus(state: ChatToolStep['state']): 'running' | 'pending' | undefined {
  if (state === 'active') return 'running'
  if (state === 'pending') return 'pending'
  return undefined
}

function stepTitle(step: ChatToolStep): string {
  if (step.state === 'active') return step.label.startsWith('Running') ? step.label : `Running ${step.label}`
  if (step.state === 'pending') return step.label.startsWith('Run ') ? step.label : `Run ${step.label}`
  return step.label
}

function StepGlyph({ state }: { state: ChatToolStep['state'] }) {
  if (state === 'done') return <CircleCheckIcon className="text-emerald-500" />
  if (state === 'active') return <Loader2Icon className="animate-spin text-orange-500" />
  return <CircleDashedIcon />
}

function formatToolPayload(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function ToolCallTraceLine({ call }: { call: ChatToolCall }) {
  const argsText = formatToolPayload(call.args)
  const resultText = call.resultPreview ?? ''
  const detail = [argsText && `// args\n${argsText}`, resultText && `// result\n${resultText}`]
    .filter(Boolean)
    .join('\n\n')

  if (!detail) {
    return (
      <TraceLine>
        <TraceIcon>
          <WrenchIcon />
        </TraceIcon>
        <TraceTitle>Called {call.name}</TraceTitle>
      </TraceLine>
    )
  }

  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>
        <TraceLine>
          <TraceIcon>
            <WrenchIcon />
          </TraceIcon>
          <TraceTitle>Called {call.name}</TraceTitle>
          {resultText ? <TraceDescription>has output</TraceDescription> : null}
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="text-foreground">
        <CodeBlock size="sm" className="bg-zinc-950/80">
          <CodeBlockHeader>
            <CodeBlockTitle>{call.name}</CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton value={detail} />
            </CodeBlockActions>
          </CodeBlockHeader>
          <CodeBlockContent wrap>{detail}</CodeBlockContent>
        </CodeBlock>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

/**
 * Agent activity for a chat turn — one Trace for steps + tool calls
 * (shadcn AI Elements Trace / Code Block, Oct 2026).
 */
export function ToolStepsPanel({
  steps,
  toolCalls,
  active,
}: {
  steps: ChatToolStep[]
  toolCalls?: ChatToolCall[]
  active?: boolean
}) {
  const calls = toolCalls ?? []
  if (steps.length === 0 && calls.length === 0) return null

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        <BrainIcon className="size-3.5" aria-hidden />
        <span>Agent activity</span>
        <span className={active ? 'ms-auto text-orange-400' : 'ms-auto text-zinc-600'}>
          {active ? 'running' : 'idle'}
        </span>
      </div>
      <Trace className="gap-1.5">
        {steps.map((step, i) => (
          <TraceLine key={`step-${i}`} status={stepStatus(step.state)}>
            <TraceIcon>
              <StepGlyph state={step.state} />
            </TraceIcon>
            <TraceTitle>{stepTitle(step)}</TraceTitle>
          </TraceLine>
        ))}
        {calls.map((call, i) => (
          <ToolCallTraceLine key={`tool-${call.name}-${i}`} call={call} />
        ))}
      </Trace>
    </div>
  )
}
