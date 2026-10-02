import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Schedule and notify for synthetic checks and Slack HITL',
  description:
    'Learn guide: optional schedule and notify MCP tools—used alone, built-in failure/recovery Slack bridge, agent-orchestrated workflows, and Human-in-the-loop with Label Studio plus Slack.',
  path: '/learn/schedule-notify-workflows',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
