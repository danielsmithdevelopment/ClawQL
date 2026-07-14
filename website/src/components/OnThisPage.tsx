'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { useSectionStore } from '@/components/SectionProvider'
import { TOC_COMPACT_THRESHOLD } from '@/lib/toc-constants'

const OnThisPageClaimContext = createContext<{
  claim: (id: string) => boolean
} | null>(null)

/**
 * Ensures only the first `OnThisPage` in the tree renders. Generated docs wrap
 * MDX with DocProse and may still receive the MDX `wrapper` — without this
 * guard, readers see two identical TOCs.
 */
export function OnThisPageProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const ownerRef = useRef<string | null>(null)
  const claim = (id: string) => {
    if (ownerRef.current === null) {
      ownerRef.current = id
      return true
    }
    return ownerRef.current === id
  }
  return (
    <OnThisPageClaimContext.Provider value={{ claim }}>
      {children}
    </OnThisPageClaimContext.Provider>
  )
}

/**
 * In-page table of contents for long docs (≥2 h2 sections).
 * Section list is seeded at build time (Layout) and kept in sync via Heading.
 */
export function OnThisPage({ className }: { className?: string }) {
  const pathname = usePathname()
  const instanceId = useId()
  const claimApi = useContext(OnThisPageClaimContext)
  const [allowed, setAllowed] = useState(
    () => claimApi?.claim(instanceId) ?? true,
  )

  useLayoutEffect(() => {
    if (!claimApi) return
    setAllowed(claimApi.claim(instanceId))
  }, [claimApi, instanceId])

  const sections = useSectionStore((s) => s.sections)
  const visibleSections = useSectionStore((s) => s.visibleSections)

  // Landing page: no in-page TOC — keep the first viewport uncluttered.
  if (pathname === '/' || !allowed || sections.length < 2) {
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
