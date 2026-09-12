import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Slack notify',
  description:
    'Optional MCP notify tool: CLAWQL_ENABLE_NOTIFY posts to Slack via chat.postMessage. Setup, channel IDs, Cursor env, Helm, and JSON examples.',
  path: '/notify',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
