import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Using ingest_external_knowledge (vault bulk + URL)',
  description:
    'How to use ingest_external_knowledge: Markdown bulk import, optional HTTPS URL fetch, dry-run workflow, env flags—and the knowledge lake roadmap for full GitHub repos, Notion, Confluence, Slack workspaces, and more.',
  path: '/learn/external-ingest-knowledge',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
