import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title:
    'Document pipeline: pdf-inspector, Docling, Tika, Gotenberg, Stirling, Paperless, Onyx, Coneshare',
  description:
    'How ClawQL’s IDP path works: optional pdf-inspector routing, Docling layout OCR, eight bundled vendors (Tika through Coneshare), classify/LangExtract MCP tools, search/execute orchestration, and CLAWQL_ENABLE_* flags.',
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
