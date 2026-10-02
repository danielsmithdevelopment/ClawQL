import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Executor.sh comparison (executor-cmp-001)',
  description:
    'Measured Layer 1 (tool definitions) vs Layer 2 (tool results) comparison against Executor on a GitHub PR list — harness, raw JSON, and live flamegraph.',
  path: '/benchmarks/executor-comparison',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
