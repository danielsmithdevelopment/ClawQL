import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Dashboard on Kubernetes',
  description:
    'Bundle the ClawQL dashboard with Helm, wire Vault + rollout sync, expose clawql.localhost, and enforce signed images with Kyverno.',
  path: '/dashboard-kubernetes',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
