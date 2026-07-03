import { clsx } from 'clsx/lite'
import type { ComponentProps, ReactNode } from 'react'
import { Link } from '../elements/link'
import { Section } from '../elements/section'
import { ArrowNarrowRightIcon } from '../icons/arrow-narrow-right-icon'

export function ToolCard({
  name,
  help,
  className,
  ...props
}: { name: string; help: ReactNode } & ComponentProps<'div'>) {
  return (
    <div
      className={clsx('flex flex-col gap-2 rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5', className)}
      {...props}
    >
      <code className="text-sm font-semibold text-mist-950 dark:text-white">{name}</code>
      <p className="text-sm/7 text-mist-700 dark:text-mist-400">{help}</p>
    </div>
  )
}

export function ToolTierSection({
  label,
  tagline,
  tools,
  className,
  ...props
}: {
  label: string
  tagline: string
  tools: readonly { name: string; help: string }[]
} & ComponentProps<'div'>) {
  return (
    <div className={clsx('flex flex-col gap-4', className)} {...props}>
      <div>
        <h3 className="text-base font-semibold text-mist-950 dark:text-white">{label}</h3>
        <p className="text-sm/7 text-mist-500 dark:text-mist-400">{tagline}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {tools.map((tool) => (
          <ToolCard key={tool.name} name={tool.name} help={tool.help} />
        ))}
      </div>
    </div>
  )
}

export function CaseStudyCard({
  title,
  outcome,
  summary,
  href,
  className,
  ...props
}: {
  title: string
  outcome: string
  summary: string
  href: string
} & ComponentProps<'article'>) {
  return (
    <article
      className={clsx(
        'flex flex-col justify-between gap-6 rounded-xl bg-mist-950/2.5 p-6 dark:bg-white/5',
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium tracking-wide text-mist-500 uppercase dark:text-mist-400">{outcome}</p>
        <h3 className="text-base font-semibold text-mist-950 dark:text-white">{title}</h3>
        <p className="text-sm/7 text-mist-700 dark:text-mist-400">{summary}</p>
      </div>
      <Link href={href}>
        Read case study <ArrowNarrowRightIcon />
      </Link>
    </article>
  )
}

export function CaseStudyGrid({
  children,
  footer,
  ...props
}: ComponentProps<typeof Section> & { footer?: ReactNode }) {
  return (
    <Section {...props}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      {footer}
    </Section>
  )
}

export function IdpStageCard({
  vendor,
  role,
  detail,
  className,
  ...props
}: {
  vendor: string
  role: string
  detail: string
} & ComponentProps<'div'>) {
  return (
    <div
      className={clsx('flex flex-col gap-2 rounded-xl bg-mist-950/2.5 p-5 dark:bg-white/5', className)}
      {...props}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-mist-950 dark:text-white">{vendor}</span>
        <span className="text-xs text-mist-500 dark:text-mist-400">{role}</span>
      </div>
      <p className="text-sm/7 text-mist-700 dark:text-mist-400">{detail}</p>
    </div>
  )
}
