import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'Concepts',
  description:
    'ClawQL concepts: how search and execute save context, MCP tool tiers, and the agent-first API workflow.',
  path: '/concepts',
})

export default function ConceptsLayout({ children }: { children: ReactNode }) {
  return children
}
