import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Optional MCP tools (Learn)',
  description:
    'When to enable cache, schedule, notify, audit, Onyx, sandbox, memory, and HITL — env flags, composed workflows, and links to deep dives.',
  path: '/learn/optional-mcp-tools',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
