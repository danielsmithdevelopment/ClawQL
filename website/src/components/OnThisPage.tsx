'use client'

import clsx from 'clsx'
import Link from 'next/link'

import { useSectionStore } from '@/components/SectionProvider'
import { TOC_COMPACT_THRESHOLD } from '@/lib/toc-constants'

/**
 * In-page table of contents for long docs (≥2 h2 sections).
 * Section list is seeded at build time (Layout) and kept in sync via Heading.
 */
export function OnThisPage({ className }: { className?: string }) {
  const sections = useSectionStore((s) => s.sections)
  const visibleSections = useSectionStore((s) => s.visibleSections)

  if (sections.length < 2) {
    return null
  }

  const compact = sections.length > TOC_COMPACT_THRESHOLD

  const list = (
    <ol className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
      {sections.map((section) => {
        const active = visibleSections.includes(section.id)
        return (
          <li key={section.id}>
            <Link
              href={`#${section.id}`}
              className={clsx(
                'block transition hover:text-zinc-900 dark:hover:text-white',
                active && 'font-medium text-zinc-900 dark:text-white',
              )}
            >
              {section.title}
            </Link>
          </li>
        )
      })}
    </ol>
  )

  if (compact) {
    return (
      <details
        className={clsx(
          'not-prose my-8 rounded-xl border border-zinc-900/10 bg-zinc-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/2.5',
          className,
        )}
      >
        <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-900 dark:text-white [&::-webkit-details-marker]:hidden">
          On this page
          <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
            ({sections.length} sections)
          </span>
        </summary>
        {list}
      </details>
    )
  }

  return (
    <nav
      aria-label="On this page"
      className={clsx(
        'not-prose my-8 rounded-xl border border-zinc-900/10 bg-zinc-50/80 px-4 py-4 dark:border-white/10 dark:bg-white/2.5',
        className,
      )}
    >
      <p className="text-sm font-semibold text-zinc-900 dark:text-white">
        On this page
      </p>
      {list}
    </nav>
  )
}
