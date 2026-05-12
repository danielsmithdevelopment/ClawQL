import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Document pipeline: Tika, Gotenberg, Stirling, Paperless, Onyx',
  description:
    'How ClawQL’s five bundled document vendors work together: extraction, PDF conversion, PDF remediation, archival DMS, and enterprise search—plus search/execute orchestration and CLAWQL_ENABLE_DOCUMENTS.',
  path: '/learn/document-pipeline',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
