import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title:
    'Case study: Vault memory ingest, GitHub tracking, and shipping enterprise audit',
  description:
    'Full session narrative: memory_ingest at scale, GitHub triage, prioritization, audit vertical slice, Helm and docs site wiring — same detail as docs/case_studies in the repo.',
  path: '/case-studies/vault-memory-github-session-2026-04',
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
