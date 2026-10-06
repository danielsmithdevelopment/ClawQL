import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { Geist } from 'next/font/google'

import { ManagedShell } from '@/components/managed/ManagedShell'
import { isManagedConsole } from '@/lib/console-surface'
import { resolveManagedSessionSync } from '@/lib/managed/session'
import { cn } from '@/lib/utils'

import '@/styles/tailwind.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' })

const managed = isManagedConsole()

export const metadata: Metadata = managed
  ? {
      title: 'ClawQL Cloud',
      description:
        'Managed ClawQL console — gateway, keys, billing, review, and audit for your organization.',
    }
  : {
      title: 'ClawQL — Dashboard',
      description:
        'Agent chat, fleet status, and Vault-backed cluster configuration for ClawQL MCP.',
    }

export const viewport: Viewport = {
  themeColor: managed
    ? [
        { media: '(prefers-color-scheme: light)', color: '#eef0f4' },
        { media: '(prefers-color-scheme: dark)', color: '#12182b' },
      ]
    : [
        { media: '(prefers-color-scheme: light)', color: '#faf8f5' },
        { media: '(prefers-color-scheme: dark)', color: '#0f1419' },
      ],
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const managedSurface = isManagedConsole()

  let body: ReactNode = children
  if (managedSurface) {
    const cookieStore = await cookies()
    const accessToken =
      cookieStore.get('sb-access-token')?.value ??
      cookieStore.get('clawql-supabase-access-token')?.value ??
      null
    const session = resolveManagedSessionSync({ accessToken })
    body = <ManagedShell session={session}>{children}</ManagedShell>
  }

  return (
    <html
      lang="en"
      className={cn(managedSurface ? 'managed' : 'dark', 'h-full', 'font-sans', geist.variable)}
    >
      <body
        className={cn(
          'min-h-dvh antialiased',
          managedSurface
            ? 'overflow-hidden bg-[var(--cloud-canvas)] text-slate-900'
            : 'overflow-hidden bg-zinc-950 text-zinc-100',
        )}
      >
        {body}
      </body>
    </html>
  )
}
