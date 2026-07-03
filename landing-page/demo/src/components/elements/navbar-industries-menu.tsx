import Link from 'next/link'

import { clsx } from 'clsx/lite'
import type { ReactNode } from 'react'
import { industries } from '@/lib/industries'

function IndustryMenuLink({
  href,
  children,
  className,
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      className={clsx(
        'block rounded-lg px-3 py-2 text-sm font-medium text-mist-700 hover:bg-mist-950/5 hover:text-mist-950 dark:text-mist-300 dark:hover:bg-white/10 dark:hover:text-white',
        className,
      )}
    >
      {children}
    </Link>
  )
}

export function NavbarIndustriesMenu() {
  return (
    <>
      {/* Desktop dropdown */}
      <div className="group relative hidden lg:block">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm/7 font-medium text-mist-950 dark:text-white"
          aria-haspopup="true"
        >
          Industries
          <svg viewBox="0 0 8 5" fill="currentColor" className="size-2 opacity-60" aria-hidden>
            <path d="M.22.22a.75.75 0 0 1 1.06 0L4 2.94 7.72.22a.75.75 0 1 1 1.06 1.06L4.53 4.53a.75.75 0 0 1-1.06 0L.22 1.28a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
        <div className="pointer-events-none absolute top-full left-1/2 z-20 mt-2 w-52 -translate-x-1/2 rounded-xl border border-mist-950/10 bg-mist-100 p-2 opacity-0 shadow-lg transition group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 dark:border-white/10 dark:bg-mist-900">
          {industries.map((industry) => (
            <IndustryMenuLink key={industry.slug} href={`/industries/${industry.slug}`}>
              {industry.name}
            </IndustryMenuLink>
          ))}
          <IndustryMenuLink href="/industries" className="text-mist-500 dark:text-mist-400">
            All industries
          </IndustryMenuLink>
        </div>
      </div>

      {/* Mobile — nested links */}
      <div className="flex flex-col gap-3 lg:hidden">
        <span className="text-3xl/10 font-medium text-mist-950 dark:text-white">Industries</span>
        {industries.map((industry) => (
          <Link
            key={industry.slug}
            href={`/industries/${industry.slug}`}
            className="pl-4 text-2xl/10 font-medium text-mist-600 dark:text-mist-300"
          >
            {industry.name}
          </Link>
        ))}
      </div>
    </>
  )
}
