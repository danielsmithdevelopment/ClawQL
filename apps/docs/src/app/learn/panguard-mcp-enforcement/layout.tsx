import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Panguard MCP enforcement (Learn)',
  description:
    'Hands-on guide: JWT ATR chokepoints, in-process Panguard proxy hooks, Helm mcpProxy, and the clawql-panguard-mcp-bridge on Kubernetes.',
  path: '/learn/panguard-mcp-enforcement',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
