import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Flink Onyx sync',
  description:
    'In-cluster Apache Flink topology for real-time Onyx index sync in ClawQL Helm deployments: architecture, values, secrets, rollout, operations, and troubleshooting.',
  path: '/flink-onyx-sync',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
