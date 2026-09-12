import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Hand off context between chats with cache',
  description:
    'Use the ClawQL Core cache MCP tool to checkpoint goals and context in one conversation and reload them in another—when both chats share the same running ClawQL server process.',
  path: '/learn/cache-handoff-between-chats',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
