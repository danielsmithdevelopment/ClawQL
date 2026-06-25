import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Case study: OpenClaw → ClawQL memory_recall',
  description:
    'Full agent chat transcript: OpenClaw calls clawql__memory_recall and returns vault notes from prior sessions — validation for solo builders using agent gateways.',
  path: '/case-studies/openclaw-clawql-memory-recall-2026-06',
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
