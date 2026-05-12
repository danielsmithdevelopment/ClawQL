import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Case study: cross-thread recall — Cuckoo / hybrid memory',
  description:
    'Full narrative: repo-only vs memory_recall, Obsidian graph, search + execute on GitHub API — same detail as docs/case_studies in the repo.',
  path: '/case-studies/cross-thread-vault-recall',
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
