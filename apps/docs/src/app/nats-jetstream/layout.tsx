import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'NATS JetStream',
  description:
    'In-cluster NATS JetStream event backbone for ClawQL Helm installs: values.yaml controls, persistence, and operational checks.',
  path: '/nats-jetstream',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
