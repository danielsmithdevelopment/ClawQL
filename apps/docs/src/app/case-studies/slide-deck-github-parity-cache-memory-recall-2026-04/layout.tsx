import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title:
    'Case study: slide deck vs GitHub — memory_recall, cache, and parity issues',
  description:
    'How memory_recall grounded a gap pass before new issues, cache() held ephemeral scratch, and memory_ingest closed the loop — same detail as docs/case_studies in the repo.',
  path: '/case-studies/slide-deck-github-parity-cache-memory-recall-2026-04',
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
