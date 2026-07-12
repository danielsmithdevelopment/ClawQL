import clsx from 'clsx'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { forwardRef, useCallback, useEffect, useState } from 'react'

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
    ssr: false,
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
    ssr: false,
    loading: () => <div className="size-6 shrink-0 lg:hidden" aria-hidden />,
  },
)

function useActivateSearchOnIntent() {
  const [ready, setReady] = useState(false)
  const [openOnMount, setOpenOnMount] = useState(false)
  const activate = useCallback(() => setReady(true), [])
  const activateAndOpen = useCallback(() => {
    setOpenOnMount(true)
    setReady(true)
  }, [])

  useEffect(() => {
    if (ready) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        activateAndOpen()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [ready, activateAndOpen])

  return { ready, openOnMount, activate, activateAndOpen }
}

function SearchPlaceholder({ onActivate }: { onActivate: () => void }) {
  return (
    <div className="hidden lg:block lg:max-w-md lg:flex-auto">
      <button
        type="button"
        onClick={onActivate}
        className="flex h-8 w-full items-center gap-2 rounded-full bg-white pr-3 pl-2 text-sm text-zinc-600 ring-1 ring-zinc-900/10 transition hover:ring-zinc-900/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claw-cyan dark:bg-white/5 dark:text-zinc-300 dark:ring-white/10 dark:ring-inset dark:hover:ring-white/20 dark:focus-visible:outline-claw-cyan-bright"
        aria-label="Search documentation"
      >
        <span className="ml-1 size-5 shrink-0 rounded-full border border-zinc-400/60 dark:border-zinc-500" />
        Search documentation…
        <kbd className="ml-auto text-2xs text-zinc-500 dark:text-zinc-300">
          <kbd className="font-sans">⌘</kbd>
          <kbd className="font-sans">K</kbd>
        </kbd>
      </button>
    </div>
  )
}

function MobileSearchPlaceholder({ onActivate }: { onActivate: () => void }) {
  return (
    <button
      type="button"
      onClick={onActivate}
      className="relative flex size-6 items-center justify-center rounded-md transition hover:bg-zinc-900/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claw-cyan lg:hidden dark:hover:bg-white/5 dark:focus-visible:outline-claw-cyan-bright"
      aria-label="Search documentation"
    >
      <span className="size-4 rounded-full border border-zinc-900 dark:border-white" />
    </button>
  )
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
  const {
    ready: searchReady,
    openOnMount,
    activateAndOpen,
  } = useActivateSearchOnIntent()

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
        <Search defaultOpen={openOnMount} />
      ) : (
        <SearchPlaceholder onActivate={activateAndOpen} />
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
            <MobileSearch defaultOpen={openOnMount} />
          ) : (
            <MobileSearchPlaceholder onActivate={activateAndOpen} />
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
