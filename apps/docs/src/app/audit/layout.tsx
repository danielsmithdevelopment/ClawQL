import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Audit Trail',
  description:
    'ClawQL append-only WORM audit trail: hash chain, Merkle batch roots, dual-ack replication, and external verification.',
  path: '/audit',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
