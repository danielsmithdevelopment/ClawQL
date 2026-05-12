import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Durable context with memory_ingest and memory_recall',
  description:
    'Persist goals and context across MCP restarts using vault-backed memory_ingest and memory_recall—requires a writable Markdown vault directory locally or a PVC (or equivalent) in Kubernetes.',
  path: '/learn/vault-memory-between-chats',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
