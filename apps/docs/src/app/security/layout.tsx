import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Security',
  description:
    'Golden image pipeline: OSV and Trivy gates, one OCI build, Cosign signing, Kyverno verifyImages by default, and links to full supply-chain docs.',
  path: '/security',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
