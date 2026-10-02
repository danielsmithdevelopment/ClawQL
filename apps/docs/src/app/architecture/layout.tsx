import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'Architecture & Vision',
  description:
    'ClawQL platform architecture: Zero-Trust Agentic Fabric, Agentic Gateway, 6-layer IDP stack, modularization, DAOS, token efficiency, and vision roadmap.',
  path: '/architecture',
})

export default function ArchitectureLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
