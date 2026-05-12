import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Tools',
  description:
    'ClawQL MCP tools by tier: Core search/execute/audit/cache (no opt-out); default-on opt-out memory, documents; opt-in sandbox, schedule, notify, Onyx wrapper, Ouroboros. stdio, Streamable HTTP, gRPC.',
  path: '/tools',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
