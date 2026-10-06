'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { useManagedSession } from '@/components/managed/ManagedSessionProvider'
import {
  isManagedNavActive,
  MANAGED_PRIMARY_NAV,
  MANAGED_SECONDARY_NAV,
  type ManagedNavItem,
} from '@/lib/managed/nav'
import { cn } from '@/lib/utils'

function NavLink({ item }: { item: ManagedNavItem }) {
  const pathname = usePathname()
  const active = isManagedNavActive(pathname, item.href)

  return (
    <Link
      href={item.href}
      data-testid={`managed-nav-${item.href === '/' ? 'home' : item.href.slice(1)}`}
      className={cn(
        'relative flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-white/10 font-medium text-white'
          : 'text-slate-300 hover:bg-white/5 hover:text-white',
      )}
    >
      <span className="flex items-center gap-2">
        {active ? <span className="size-1.5 rounded-full bg-orange-400" aria-hidden /> : null}
        {item.label}
      </span>
      {item.badge != null ? (
        <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
          {item.badge}
        </span>
      ) : null}
    </Link>
  )
}

export function ManagedSidebar() {
  const session = useManagedSession()

  return (
    <aside className="flex h-full min-h-0 w-[15.5rem] shrink-0 flex-col bg-[var(--cloud-sidebar)] text-slate-100">
      <div className="px-4 pt-5 pb-3">
        <Link href="/" className="font-heading text-[15px] font-semibold tracking-tight text-white">
          ClawQL <span className="font-normal text-slate-300">Cloud</span>
        </Link>
        <button
          type="button"
          className="mt-3 flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition-colors hover:bg-white/10"
          data-testid="org-switcher"
        >
          <span>
            <span className="block text-sm font-medium text-white">{session.orgName}</span>
            <span className="block text-xs text-slate-400">{session.planLabel}</span>
          </span>
          <span className="text-slate-400" aria-hidden>
            ▾
          </span>
        </button>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-2 pb-3">
        <div className="space-y-0.5">
          {MANAGED_PRIMARY_NAV.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>
        <div className="mt-auto space-y-0.5 border-t border-white/10 pt-3">
          {MANAGED_SECONDARY_NAV.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>
      </nav>

      <div className="border-t border-white/10 px-3 py-3">
        <Link
          href="/profile"
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5"
          data-testid="managed-nav-profile"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white">
            {session.initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">{session.displayName}</span>
            <span className="block truncate text-xs text-slate-400">{session.role}</span>
          </span>
        </Link>
        <button
          type="button"
          className="mt-1 w-full rounded-md px-2 py-1 text-left text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          data-testid="sign-out"
        >
          Sign out
        </button>
        {session.mode === 'mock' ? (
          <p className="mt-2 px-2 text-[10px] leading-snug text-slate-500">
            Mock Supabase session — set real keys to use Auth.
          </p>
        ) : null}
      </div>
    </aside>
  )
}
