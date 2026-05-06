import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import '@/styles/tailwind.css'

export const metadata: Metadata = {
  title: 'ClawQL — Kubernetes env dashboard',
  description:
    'Edit ClawQL MCP environment variables from .env.example and sync them to a Kubernetes Secret.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f5' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1419' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="min-h-full bg-claw-warm-white antialiased dark:bg-claw-bg dark:text-zinc-100">
        {children}
      </body>
    </html>
  )
}
