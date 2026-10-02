'use client'

import Link from 'next/link'
import { useDeferredValue, useMemo, useState } from 'react'

export type ArchiveEntry = {
  href: string
  title: string
  description: string
  group: string
  redirectTo?: string
}

export type ArchiveGroup = {
  name: string
  entries: ArchiveEntry[]
}

function matchesQuery(entry: ArchiveEntry, q: string) {
  if (!q) return true
  const hay =
    `${entry.title} ${entry.href} ${entry.description} ${entry.group}`.toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token))
}

export function DocsArchiveBrowser({
  groups,
  entryCount,
}: {
  groups: ArchiveGroup[]
  entryCount: number
}) {
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)

  const filtered = useMemo(() => {
    return groups
      .map((group) => ({
        ...group,
        entries: group.entries.filter((e) => matchesQuery(e, deferred)),
      }))
      .filter((g) => g.entries.length > 0)
  }, [groups, deferred])

  const visibleCount = filtered.reduce((n, g) => n + g.entries.length, 0)

  return (
    <div className="not-prose">
      <label className="block">
        <span className="sr-only">Filter archive pages</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by title, path, or topic…"
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-950 shadow-sm ring-claw-cyan/40 outline-none placeholder:text-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500"
        />
      </label>
      <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
        Showing {visibleCount} of {entryCount} pages not listed in the sidebar.
        Use site search (⌘K) for full-text content.
      </p>

      <div className="mt-10 space-y-12">
        {filtered.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            No matches. Try a shorter query, or{' '}
            <button
              type="button"
              className="font-medium text-[#0e7490] underline underline-offset-2 dark:text-claw-cyan"
              onClick={() => setQuery('')}
            >
              clear the filter
            </button>
            .
          </p>
        ) : (
          filtered.map((group) => (
            <section key={group.name} aria-labelledby={`archive-${group.name}`}>
              <h2
                id={`archive-${group.name}`}
                className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400"
              >
                {group.name}
                <span className="ml-2 font-normal text-zinc-400 normal-case dark:text-zinc-500">
                  {group.entries.length}
                </span>
              </h2>
              <ul className="mt-4 divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
                {group.entries.map((entry) => (
                  <li key={entry.href} className="py-4">
                    <Link
                      href={entry.href}
                      className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-claw-cyan/50"
                    >
                      <span className="text-base font-semibold text-zinc-950 group-hover:text-[#0e7490] dark:text-white dark:group-hover:text-claw-cyan">
                        {entry.title}
                      </span>
                      <span className="mt-0.5 block font-mono text-xs text-zinc-500 dark:text-zinc-500">
                        {entry.href}
                        {entry.redirectTo ? <> → {entry.redirectTo}</> : null}
                      </span>
                      {entry.description ? (
                        <span className="mt-1 block text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                          {entry.description}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
