import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Streams getting started (Learn)',
  description:
    'Read the Streams stack in order: event loop, Durable Objects, celld vs cellrt, TEE, and air-gap audit — what ships today vs draft specs.',
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
