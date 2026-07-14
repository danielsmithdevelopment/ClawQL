import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'Getting started',
  description:
    'ClawQL getting started: quickstart, migration, install paths, MCP clients, team shared memory, and deployment tiers.',
  path: '/getting-started',
})

export default function GettingStartedLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
