'use client'

import Link from 'next/link'
import { useState } from 'react'

import { PageChrome } from '@/components/managed/PageChrome'
import { StatusDot } from '@/components/managed/StatusDot'
import { Button } from '@/components/ui/button'
import { useManagedSession } from '@/components/managed/ManagedSessionProvider'
import {
  GATEWAY_BASE,
  GATEWAY_ENDPOINTS,
  HOME_ACTIONS,
  HOME_ACTIVITY,
  HOME_STATUS,
} from '@/lib/managed/fixtures'
import { cn } from '@/lib/utils'

function copyText(value: string) {
  void navigator.clipboard?.writeText(value)
}

export function HomePage() {
  const session = useManagedSession()
  const [query, setQuery] = useState('Which vendor contracts renew before the end of Q4?')

  return (
    <PageChrome
      crumbs={['Home']}
      title={`Welcome back, ${session.displayName.split(' ')[0]}`}
      description="Two things need you, and everything else is running."
      actions={
        <Link
          href="/connections"
          className="inline-flex h-8 items-center rounded-lg bg-slate-900 px-3 text-sm font-medium text-white transition-colors hover:bg-slate-800"
        >
          Add connection
        </Link>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="cloud-search">
          Search
        </label>
        <input
          id="cloud-search"
          type="search"
          placeholder="Search sessions, events, memory"
          className="h-9 w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none ring-slate-300 placeholder:text-slate-400 focus:ring-2"
        />
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Status">
        {HOME_STATUS.map((card) => (
          <div
            key={card.id}
            className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 shadow-sm shadow-slate-900/5"
          >
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <StatusDot tone={card.tone} />
              {card.value}
            </p>
            {card.progress ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{ width: `${Math.min(100, (card.progress.value / card.progress.max) * 100)}%` }}
                />
              </div>
            ) : null}
            {card.href && card.linkLabel ? (
              <Link href={card.href} className="mt-2 inline-block text-xs text-sky-700 hover:underline">
                {card.linkLabel}
              </Link>
            ) : null}
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/5">
        <h2 className="text-sm font-semibold text-slate-900">Ask your memory, or add a document</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none ring-slate-300 focus:bg-white focus:ring-2"
            aria-label="Ask memory"
          />
          <div className="flex gap-2">
            <Button type="button">Ask</Button>
            <Button type="button" variant="outline">
              Upload
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          PDFs, Office files, and email. Personal data is redacted before anything is stored.
        </p>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Needs action</h2>
            <Link href="/review" className="text-xs font-medium text-sky-700 hover:underline">
              Open Review
            </Link>
          </div>
          <ul className="space-y-3">
            {HOME_ACTIONS.map((item) => (
              <li key={item.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                  <span
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      item.badgeTone === 'warn'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-200 text-slate-700',
                    )}
                  >
                    {item.badge}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-slate-600">{item.body}</p>
                <p className="mt-1 font-mono text-[11px] text-slate-500">{item.meta}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm">
                    Approve with security key
                  </Button>
                  <Button type="button" size="sm" variant="outline">
                    Decline
                  </Button>
                  {item.evidenceHref ? (
                    <Link href={item.evidenceHref} className="text-xs text-sky-700 hover:underline">
                      See the evidence
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              Activity
              <span className="inline-flex items-center gap-1 text-xs font-normal text-emerald-700">
                <StatusDot tone="ok" /> Live
              </span>
            </h2>
            <Link href="/audit" className="text-xs font-medium text-sky-700 hover:underline">
              Open audit log
            </Link>
          </div>
          <ol className="space-y-3 border-l border-slate-200 pl-3">
            {HOME_ACTIVITY.map((item) => (
              <li key={item.id}>
                <p className="font-mono text-[11px] text-slate-500">{item.kind}</p>
                <p className="text-sm text-slate-700">{item.summary}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Your gateway</h2>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-700">
            {GATEWAY_BASE}
            <button
              type="button"
              className="text-sky-700 hover:underline"
              onClick={() => copyText(GATEWAY_BASE)}
            >
              Copy
            </button>
          </div>
        </div>
        <ul className="mt-4 divide-y divide-slate-100">
          {GATEWAY_ENDPOINTS.map((ep) => (
            <li key={ep.path} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div>
                <p className="font-mono text-sm font-medium text-slate-900">{ep.path}</p>
                <p className="text-xs text-slate-500">{ep.description}</p>
              </div>
              <button
                type="button"
                className="text-xs text-sky-700 hover:underline"
                onClick={() => copyText(`${GATEWAY_BASE}${ep.path}`)}
              >
                Copy
              </button>
            </li>
          ))}
        </ul>
      </section>
    </PageChrome>
  )
}
