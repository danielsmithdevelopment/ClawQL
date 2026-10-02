import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'Kubernetes',
  description:
    'Deploy ClawQL on Kubernetes: Helm and Kustomize, Streamable HTTP /mcp, optional gRPC, Kyverno image signing, and Docker Desktop local parity.',
  path: '/deployment/kubernetes',
})

export default function DeploymentKubernetesLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
