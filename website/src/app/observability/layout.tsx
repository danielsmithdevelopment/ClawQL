import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Observability',
  description:
    'ClawQL LGTM+ runtime telemetry: Grafana Alloy ingest, governed multi-provider registry, Langfuse/Panguard correlation, security sensors, alerting, ephemeral JWT Faro proxy, and query federation — distinct from audit and analytics.',
  path: '/observability',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
