import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'clawql-memory (Memory 2.0) — vault, wikilinks, recall, team sync',
  description:
    'Learn guide: clawql-memory architecture — Obsidian vault ingest/recall, hands-on MCP walkthrough, wikilink graph, hybrid vectors, PageIndex, team sync, inference flywheel, and DAOS roadmap for pruning and governance.',
  path: '/learn/memory',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
