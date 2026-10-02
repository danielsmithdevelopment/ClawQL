import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'Platform operations',
  description:
    'ClawQL platform operations: Streamable HTTP, optional gRPC, Docker images, and Cloud Run hosting alongside Quickstart and Kubernetes.',
  path: '/deployment/platforms',
})

export default function DeploymentPlatformsLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
