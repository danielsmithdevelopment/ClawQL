import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Document pipeline: Nextcloud, Tika, Gotenberg, Stirling, Paperless, Onyx, Coneshare',
  description:
    'How ClawQL’s seven bundled IDP vendors work together: WebDAV intake, extraction, PDF conversion, redaction, archival DMS, enterprise search, and secure sharing—plus search/execute orchestration and CLAWQL_ENABLE_DOCUMENTS.',
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
