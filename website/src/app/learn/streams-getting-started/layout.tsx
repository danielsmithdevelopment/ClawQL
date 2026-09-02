import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Streams getting started (Learn)',
  description:
    'Hands-on Streams labs (schedule, NATS JetStream, IDP overlay, agent bridge) plus reading order through DO, celld, cellrt, TEE, and air-gap audit.',
  path: '/learn/streams-getting-started',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
