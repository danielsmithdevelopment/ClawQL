import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title:
    'Case study: docs.clawql.com Worker 1102, MCP search/execute, memory_ingest, and guardrails (Apr 2026)',
  description:
    'Incident: Error 1102 and waitUntil cancellations on the docs site; debugging with ClawQL search and execute on Cloudflare APIs; memory_ingest postmortem; Lighthouse CI and WCAG/SEO follow-ups.',
  path: '/case-studies/docs-clawql-worker-1102-mcp-memory-2026-04',
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
