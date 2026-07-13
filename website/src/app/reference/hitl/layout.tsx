import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'HITL & human interfaces',
  description:
    'Human-in-the-loop patterns for ClawQL agents: approval flows, reviewer routing, and hypermedia dashboards.',
  path: '/reference/hitl',
})

export default function HitlReferenceLayout({ children }: { children: ReactNode }) {
  return children
}
