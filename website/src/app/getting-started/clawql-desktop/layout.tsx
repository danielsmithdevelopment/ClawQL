import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'ClawQL Desktop (macOS)',
  description:
    'ClawQL Desktop for macOS: local provider secrets vault, Agent Chat, and solo dev without Kubernetes.',
  path: '/getting-started/clawql-desktop',
})

export default function ClawqlDesktopLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
