import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Case study: Deploying docs.clawql.com with ClawQL MCP',
  description:
    'Full narrative: Cloudflare Workers + OpenNext, search/execute for control plane, memory tools, fs/runtime failures, caching — same detail as docs/case_studies in the repo.',
  path: '/case-studies/cloudflare-docs-mcp',
  ogType: 'article',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
