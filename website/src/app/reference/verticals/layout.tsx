import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'Verticals guide',
  description:
    'ClawQL vertical packages (lending, legal, healthcare) extend the gateway with domain-specific tools on shared security and audit infrastructure.',
  path: '/reference/verticals',
})

export default function VerticalsGuideLayout({ children }: { children: ReactNode }) {
  return children
}
