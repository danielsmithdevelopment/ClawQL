import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Onyx knowledge search',
  description:
    'Optional MCP knowledge_search_onyx tool: CLAWQL_ENABLE_ONYX, ONYX_BASE_URL, ONYX_API_TOKEN, bundled onyx provider, semantic document search examples, and memory_ingest pairing.',
  path: '/onyx-knowledge',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
