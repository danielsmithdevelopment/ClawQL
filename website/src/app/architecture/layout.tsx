import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'Architecture & Vision',
  description:
    'ClawQL platform architecture: 6-layer IDP stack, modularization, DAOS, immutable releases, token efficiency, and vision roadmap.',
  path: '/architecture',
})

export default function ArchitectureLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
