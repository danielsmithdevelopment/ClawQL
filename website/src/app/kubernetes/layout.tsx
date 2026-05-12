import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Kubernetes',
  description:
    'Helm or Kustomize, Kyverno and signed GHCR images, Streamable HTTP Ingress clawql-mcp.localhost (prod parity), optional gRPC.',
  path: '/kubernetes',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
