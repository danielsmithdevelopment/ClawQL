import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Benchmarks',
  description:
    'ClawQL benchmarks: planning context size vs merged specs, search workflow artifacts, methodology and reproducible scripts in the open-source repo.',
  path: '/benchmarks',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
