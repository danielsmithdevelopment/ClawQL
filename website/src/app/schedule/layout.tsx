import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Schedule synthetic checks',
  description:
    'Optional MCP schedule tool: CLAWQL_ENABLE_SCHEDULE for persisted jobs, automatic cron/interval/one-shot execution, synthetic HTTP assertions, trigger dry_run, and run history examples.',
  path: '/schedule',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
