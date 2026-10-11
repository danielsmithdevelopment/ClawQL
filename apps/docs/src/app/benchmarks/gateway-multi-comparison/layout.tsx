import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Gateway multi-arm comparison',
  description:
    'Equal-arm MCP gateway board: ClawQL vs MCPJungle, agentgateway, Executor, and a no-gateway direct HTTP baseline — tokens, latency, RSS, and why Bun.',
  path: '/benchmarks/gateway-multi-comparison',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
