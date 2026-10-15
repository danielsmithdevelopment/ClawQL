import type { ReactNode } from 'react'

import { ManagedSessionProvider } from '@/components/managed/ManagedSessionProvider'
import { ManagedSidebar } from '@/components/managed/ManagedSidebar'
import type { ManagedSession } from '@/lib/managed/session'

export function ManagedShell({
  session,
  children,
}: {
  session: ManagedSession
  children: ReactNode
}) {
  return (
    <ManagedSessionProvider session={session}>
      <div className="flex h-dvh min-h-0 bg-[var(--cloud-canvas)] text-slate-900">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900 focus:shadow"
        >
          Skip to main content
        </a>
        <ManagedSidebar />
        <main
          id="main-content"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </ManagedSessionProvider>
  )
}
