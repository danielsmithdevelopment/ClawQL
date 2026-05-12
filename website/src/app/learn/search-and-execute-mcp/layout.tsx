import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Using search and execute (ClawQL Core MCP)',
  description:
    'How to use the Core search and execute MCP tools: discover operationId with search, run one call with execute, args, fields, auth, and native GraphQL/gRPC—plus case studies for real workflows.',
  path: '/learn/search-and-execute-mcp',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
