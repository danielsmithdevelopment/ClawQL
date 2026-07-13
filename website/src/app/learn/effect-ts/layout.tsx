import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Effect-TS in ClawQL (architecture enforcement)',
  description:
    'Learn guide: why Effect-TS is the compile-time enforcement mechanism for ClawQL’s acyclic 7-layer architecture, Gateway-only composition, fail-closed errors, optional Layers, and test isolation.',
  path: '/learn/effect-ts',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
