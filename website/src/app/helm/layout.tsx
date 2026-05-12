import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Helm',
  description:
    'charts/clawql-mcp Helm chart: install, values, default Kyverno verifyImages for signed GHCR images, Ingress and persistence.',
  path: '/helm',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
