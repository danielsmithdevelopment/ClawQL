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
        <ManagedSidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </ManagedSessionProvider>
  )
}
