import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'HITL — Label Studio',
  description:
    'Optional hitl_enqueue_label_studio MCP tool and POST /hitl/label-studio/webhook: CLAWQL_ENABLE_HITL_LABEL_STUDIO, Label Studio API import, webhooks, vault memory_ingest vs audit, Helm, OpenClaw confidence routing.',
  path: '/hitl-label-studio',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
