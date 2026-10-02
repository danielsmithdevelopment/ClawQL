import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Quickstart',
  description:
    'ClawQL quickstart: run the MCP server on stdio or Streamable HTTP, optional gRPC, connect Cursor or Claude Desktop, and query APIs with search and execute.',
  path: '/quickstart',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
