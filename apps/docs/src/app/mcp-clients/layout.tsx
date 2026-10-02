import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'MCP clients',
  description:
    'Configure Cursor, Claude Desktop, and MCP hosts for ClawQL: stdio, Streamable HTTP URL, optional gRPC client metadata, specs, vault, sandbox bridge.',
  path: '/mcp-clients',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
