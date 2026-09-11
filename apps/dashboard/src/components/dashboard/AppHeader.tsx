'use client'

import { Github, BookOpen, Search, User } from 'lucide-react'

import { Logo } from '@/components/Logo'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDashboardRuntime } from '@/lib/use-dashboard-runtime'
import { cn } from '@/lib/utils'

export function AppHeader({ className }: { className?: string }) {
  const runtime = useDashboardRuntime()
  const desktopMode = runtime?.desktopMode ?? false

  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-zinc-950/90 px-4 backdrop-blur sm:px-6',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Logo className="[&_span]:text-orange-500 [&_span]:font-semibold" />
        {desktopMode ? (
          <span className="hidden rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-400 sm:inline">
            Desktop
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <a
          href="https://github.com/danielsmithdevelopment/ClawQL"
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden text-xs sm:inline-flex')}
        >
          <Github className="size-4" aria-hidden />
          Github
        </a>
        <a
          href="https://docs.clawql.com"
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden text-xs sm:inline-flex')}
        >
          <BookOpen className="size-4" aria-hidden />
          Docs
        </a>
        <div className="relative hidden max-w-xs flex-1 md:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <Input
            type="search"
            placeholder="Search…"
            className="h-9 border-white/10 bg-zinc-900 pl-9 pr-16 text-xs"
            aria-label="Search"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-white/10 bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 lg:inline">
            ⌘ K
          </kbd>
        </div>
        <button
          type="button"
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'rounded-full')}
          aria-label="Account"
        >
          <User className="size-5 text-zinc-400" />
        </button>
      </div>
    </header>
  )
}
