import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'Protocol reference (v2.1)',
  description:
    'ClawQL gateway protocol v2.1: uniform response envelope, classification-aware routing, two-phase commit, HATEOAS links, and htmx-friendly HTML.',
  path: '/reference/protocol',
})

export default function ProtocolReferenceLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
