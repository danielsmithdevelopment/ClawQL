import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import '@/styles/tailwind.css'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'ClawQL — Dashboard',
  description:
    'Agent chat, fleet status, and Vault-backed cluster configuration for ClawQL MCP.',
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
    <html lang="en" className={cn("dark h-full", "font-sans", geist.variable)}>
      <body className="min-h-dvh overflow-hidden bg-zinc-950 antialiased text-zinc-100">
        {children}
      </body>
    </html>
  )
}
