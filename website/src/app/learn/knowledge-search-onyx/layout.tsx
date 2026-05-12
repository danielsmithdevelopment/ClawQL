import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Using knowledge_search_onyx (Onyx enterprise index)',
  description:
    'What Onyx is, how ClawQL’s optional knowledge_search_onyx tool calls your index, env and merge prerequisites, query tips, connector coverage and ACLs, pairing with memory_ingest and Slack notify.',
  path: '/learn/knowledge-search-onyx',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
