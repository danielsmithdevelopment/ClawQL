import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'Phase 1 platform guide (7.0)',
  description:
    'What shipped in ClawQL Phase 1 exit (7.0.0): gateway auth, PageIndex, Presidio hooks, Tier 1 Compose, and release manifest workflows.',
  path: '/getting-started/phase-1-platform-guide',
})

export default function Phase1PlatformGuideLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
