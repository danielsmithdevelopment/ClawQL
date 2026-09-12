import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'ClawQL Learn',
  description:
    'ClawQL Learn: curated how-to guides and learning paths across install, MCP clients, specs, deployment, Kubernetes, security, and optional tools—plus room for future modules.',
  path: '/learn',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
