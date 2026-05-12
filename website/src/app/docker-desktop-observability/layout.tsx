import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Docker Desktop: Istio & observability',
  description:
    'Prometheus, Grafana, Grafana Loki, Grafana Tempo, Kiali, and OpenTelemetry Collector on Docker Desktop with ClawQL—what each tool is and beginner getting-started.',
  path: '/docker-desktop-observability',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
