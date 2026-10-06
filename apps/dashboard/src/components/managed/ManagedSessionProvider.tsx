'use client'

import { createContext, useContext, type ReactNode } from 'react'

import type { ManagedSession } from '@/lib/managed/session'

const ManagedSessionContext = createContext<ManagedSession | null>(null)

export function ManagedSessionProvider({
  session,
  children,
}: {
  session: ManagedSession
  children: ReactNode
}) {
  return <ManagedSessionContext.Provider value={session}>{children}</ManagedSessionContext.Provider>
}

export function useManagedSession(): ManagedSession {
  const session = useContext(ManagedSessionContext)
  if (!session) {
    throw new Error('useManagedSession must be used within ManagedSessionProvider')
  }
  return session
}
