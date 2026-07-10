import clsx from 'clsx'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { forwardRef, useEffect, useState } from 'react'

import { Button } from '@/components/Button'
import { Logo } from '@/components/Logo'
import {
  MobileNavigation,
  useIsInsideMobileNavigation,
  useMobileNavigationStore,
} from '@/components/MobileNavigation'
import { ThemeToggle } from '@/components/ThemeToggle'
import { CloseButton } from '@headlessui/react'

const Search = dynamic(
  () => import('@/components/Search').then((m) => ({ default: m.Search })),
  {
    loading: () => (
      <div
        className="hidden h-8 w-full max-w-md lg:block lg:max-w-md lg:flex-auto"
        aria-hidden
      />
    ),
  },
)

const MobileSearch = dynamic(
  () =>
    import('@/components/Search').then((m) => ({ default: m.MobileSearch })),
  {
    loading: () => <div className="size-6 shrink-0 lg:hidden" aria-hidden />,
  },
)

function useDeferSearchChrome() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (ready) return
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => setReady(true), {
        timeout: 2500,
      })
      return () => window.cancelIdleCallback(id)
    }
    const timer = window.setTimeout(() => setReady(true), 1200)
    return () => window.clearTimeout(timer)
  }, [ready])

  return ready
}

function TopLevelNavItem({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  const external = href.startsWith('http')
  return (
    <li>
      <Link
        href={href}
        rel={external ? 'noopener noreferrer' : undefined}
        className="text-sm/5 text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
      >
        {children}
      </Link>
    </li>
  )
}

export const Header = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(function Header({ className, ...props }, ref) {
  let { isOpen: mobileNavIsOpen } = useMobileNavigationStore()
  let isInsideMobileNavigation = useIsInsideMobileNavigation()
  const searchReady = useDeferSearchChrome()

  return (
    <div
      {...props}
      ref={ref}
      className={clsx(
        className,
        'fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between gap-12 px-4 transition sm:px-6 lg:left-72 lg:z-30 lg:px-8 xl:left-80',
        !isInsideMobileNavigation &&
          'backdrop-blur-xs lg:left-72 xl:left-80 dark:backdrop-blur-sm',
        isInsideMobileNavigation
          ? 'bg-claw-warm-white dark:bg-claw-bg'
          : 'bg-white/80 dark:bg-claw-bg/80',
      )}
    >
      <div
        className={clsx(
          'absolute inset-x-0 top-full h-px transition',
          (isInsideMobileNavigation || !mobileNavIsOpen) &&
            'bg-zinc-900/7.5 dark:bg-white/7.5',
        )}
      />
      {searchReady ? (
        <Search />
      ) : (
        <div
          className="hidden h-8 w-full max-w-md lg:block lg:max-w-md lg:flex-auto"
          aria-hidden
        />
      )}
      <div className="flex items-center gap-5 lg:hidden">
        <MobileNavigation />
        <CloseButton as={Link} href="/" aria-label="Home">
          <Logo />
        </CloseButton>
      </div>
      <div className="flex items-center gap-5">
        <nav className="hidden md:block" aria-label="Site">
          <ul role="list" className="flex items-center gap-8">
            <TopLevelNavItem href="/">Home</TopLevelNavItem>
            <TopLevelNavItem href="/quickstart">Quickstart</TopLevelNavItem>
            <TopLevelNavItem href="/learn">Learn</TopLevelNavItem>
            <TopLevelNavItem href="https://github.com/danielsmithdevelopment/ClawQL">
              GitHub
            </TopLevelNavItem>
          </ul>
        </nav>
        <div className="hidden md:block md:h-5 md:w-px md:bg-zinc-900/10 md:dark:bg-white/15" />
        <div className="flex gap-4">
          {searchReady ? (
            <MobileSearch />
          ) : (
            <div className="size-6 shrink-0 lg:hidden" aria-hidden />
          )}
          <ThemeToggle />
        </div>
        <div className="hidden min-[416px]:contents">
          <Button href="https://www.npmjs.com/package/clawql-mcp">npm</Button>
        </div>
      </div>
    </div>
  )
})
