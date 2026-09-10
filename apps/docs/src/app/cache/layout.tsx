import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Session cache',
  description:
    'MCP cache tool: ClawQL Core (always on). In-process LRU. Not the vault — use memory_ingest and memory_recall for durable memory (CLAWQL_ENABLE_MEMORY=0 to hide vault tools).',
  path: '/cache',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
