import { clsx } from 'clsx/lite'
import type { ComponentProps, ReactNode } from 'react'
import { Link } from '../elements/link'
import { Section } from '../elements/section'
import { ArrowNarrowRightIcon } from '../icons/arrow-narrow-right-icon'
import { ChatBubbleCircleEllipsisIcon } from '../icons/chat-bubble-circle-ellipsis-icon'
import { CheckmarkIcon } from '../icons/checkmark-icon'
import { TerminalIcon } from '../icons/terminal-icon'
import type { WorkflowFeed, WorkflowFeedStep, WorkflowFeedStepKind } from '@/lib/workflow-feeds'

const stepIcon: Record<WorkflowFeedStepKind, ReactNode> = {
  agent: <ChatBubbleCircleEllipsisIcon className="size-3.5" />,
  tool: <TerminalIcon className="size-3.5" />,
  result: <CheckmarkIcon className="size-3.5" />,
}

const stepIconRing: Record<WorkflowFeedStepKind, string> = {
  agent: 'bg-mist-950/5 text-mist-700 ring-mist-950/10 dark:bg-white/10 dark:text-mist-200 dark:ring-white/10',
  tool: 'bg-mist-950/8 text-mist-950 ring-mist-950/15 dark:bg-white/15 dark:text-white dark:ring-white/15',
  result: 'bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20',
}

function WorkflowFeedStepRow({ step, isLast }: { step: WorkflowFeedStep; isLast: boolean }) {
  return (
    <li className="relative flex gap-x-4 pb-8 last:pb-0">
      {!isLast ? (
        <div
          aria-hidden="true"
          className="absolute top-7 left-3 -bottom-1 w-px bg-mist-950/10 dark:bg-white/10"
        />
      ) : null}
      <div
        className={clsx(
          'relative flex size-6 flex-none items-center justify-center rounded-full ring-1 ring-inset',
          stepIconRing[step.kind],
        )}
      >
        {stepIcon[step.kind]}
      </div>
      <div className="flex min-w-0 flex-auto flex-col gap-1.5 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm/6 font-medium text-mist-950 dark:text-white">{step.title}</p>
          {step.tool ? (
            <code className="rounded-md bg-mist-950/5 px-1.5 py-0.5 text-xs font-semibold text-mist-800 dark:bg-white/10 dark:text-mist-200">
              {step.tool}()
            </code>
          ) : null}
        </div>
        <p className="text-sm/7 text-mist-600 dark:text-mist-400">{step.body}</p>
      </div>
    </li>
  )
}

export function WorkflowFeedPanel({
  feed,
  className,
  ...props
}: { feed: WorkflowFeed } & ComponentProps<'article'>) {
  return (
    <article
      className={clsx('flex flex-col gap-6 rounded-2xl bg-mist-950/2.5 p-6 sm:p-8 dark:bg-white/5', className)}
      {...props}
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-mist-500 uppercase dark:text-mist-400">{feed.source}</p>
        <h3 className="text-base font-semibold text-mist-950 dark:text-white">{feed.title}</h3>
      </div>
      <ol className="list-none">
        {feed.steps.map((step, index) => (
          <WorkflowFeedStepRow key={`${feed.slug}-${index}`} step={step} isLast={index === feed.steps.length - 1} />
        ))}
      </ol>
      <Link href={feed.href}>
        Read case study <ArrowNarrowRightIcon />
      </Link>
    </article>
  )
}

export function WorkflowFeedSection({
  feeds,
  ...props
}: ComponentProps<typeof Section> & { feeds: readonly WorkflowFeed[] }) {
  return (
    <Section {...props}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {feeds.map((feed) => (
          <WorkflowFeedPanel key={feed.slug} feed={feed} />
        ))}
      </div>
    </Section>
  )
}
