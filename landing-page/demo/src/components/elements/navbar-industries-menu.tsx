'use client'

import Link from 'next/link'

import { clsx } from 'clsx/lite'
import { type ReactNode, useState } from 'react'
import { industries } from '@/lib/industries'

import { closeMobileMenu } from './close-mobile-menu'

function IndustryMenuLink({
  href,
  children,
  className,
  onNavigate,
}: {
  href: string
  children: ReactNode
  className?: string
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={() => onNavigate?.()}
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopOpen, setDesktopOpen] = useState(false)

  function handleNavigate() {
    closeMobileMenu()
    setMobileOpen(false)
    setDesktopOpen(false)
  }

  return (
    <>
      {/* Desktop dropdown */}
      <div className="relative hidden lg:block">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm/7 font-medium text-mist-950 dark:text-white"
          aria-haspopup="true"
          aria-expanded={desktopOpen}
          onClick={() => setDesktopOpen((open) => !open)}
          onBlur={(event) => {
            if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) {
              setDesktopOpen(false)
            }
          }}
        >
          Industries
          <svg
            viewBox="0 0 8 5"
            fill="currentColor"
            className={clsx('size-2 opacity-60 transition-transform', desktopOpen && 'rotate-180')}
            aria-hidden
          >
            <path d="M.22.22a.75.75 0 0 1 1.06 0L4 2.94 7.72.22a.75.75 0 1 1 1.06 1.06L4.53 4.53a.75.75 0 0 1-1.06 0L.22 1.28a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
        {desktopOpen ? (
          <div className="absolute top-full left-1/2 z-20 mt-2 w-52 -translate-x-1/2 rounded-xl border border-mist-950/10 bg-mist-100 p-2 shadow-lg dark:border-white/10 dark:bg-mist-900">
            {industries.map((industry) => (
              <IndustryMenuLink
                key={industry.slug}
                href={`/industries/${industry.slug}`}
                onNavigate={handleNavigate}
              >
                {industry.name}
              </IndustryMenuLink>
            ))}
            <IndustryMenuLink href="/industries" className="text-mist-600 dark:text-mist-400" onNavigate={handleNavigate}>
              All industries
            </IndustryMenuLink>
          </div>
        ) : null}
      </div>

      {/* Mobile — click to expand submenu */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-industries-submenu"
          className="inline-flex w-full items-center justify-between gap-2 text-3xl/10 font-medium text-mist-950 dark:text-white"
        >
          Industries
          <svg
            viewBox="0 0 8 5"
            fill="currentColor"
            className={clsx('size-3 opacity-60 transition-transform', mobileOpen && 'rotate-180')}
            aria-hidden
          >
            <path d="M.22.22a.75.75 0 0 1 1.06 0L4 2.94 7.72.22a.75.75 0 1 1 1.06 1.06L4.53 4.53a.75.75 0 0 1-1.06 0L.22 1.28a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
        {mobileOpen ? (
          <div id="mobile-industries-submenu" className="mt-3 flex flex-col gap-3 pl-4">
            {industries.map((industry) => (
              <Link
                key={industry.slug}
                href={`/industries/${industry.slug}`}
                onClick={handleNavigate}
                className="text-2xl/10 font-medium text-mist-600 dark:text-mist-300"
              >
                {industry.name}
              </Link>
            ))}
            <Link
              href="/industries"
              onClick={handleNavigate}
              className="text-2xl/10 font-medium text-mist-600 dark:text-mist-400"
            >
              All industries
            </Link>
          </div>
        ) : null}
      </div>
    </>
  )
}
