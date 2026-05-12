import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Deployment',
  description:
    'Deploy ClawQL: Docker Distroless image, Streamable HTTP /mcp, ENABLE_GRPC, Cloud Run, Kubernetes Helm/Kustomize, golden image pipeline and Kyverno enforcement.',
  path: '/deployment',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
