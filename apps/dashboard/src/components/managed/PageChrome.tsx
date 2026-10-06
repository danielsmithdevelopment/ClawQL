'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

import { useManagedSession } from '@/components/managed/ManagedSessionProvider'
import { cn } from '@/lib/utils'

export function PageChrome({
  crumbs,
  title,
  description,
  actions,
  children,
  className,
}: {
  crumbs: readonly string[]
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  const session = useManagedSession()
  const trail = crumbs[0] === session.orgName ? crumbs : [session.orgName, ...crumbs]

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto', className)}>
      <header className="shrink-0 px-6 pt-5 pb-4 sm:px-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="text-xs text-slate-500">{trail.join(' / ')}</p>
          <Link
            href="https://docs.clawql.com"
            className="text-sm text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Docs
          </Link>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
            {description ? <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-6 pb-10 sm:px-8">{children}</div>
    </div>
  )
}
