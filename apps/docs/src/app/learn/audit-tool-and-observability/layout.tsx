import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Audit tool and observability (Prometheus, Grafana, Loki, Tempo)',
  description:
    'ClawQL Core audit MCP tool: append/list/clear ring buffer; Prometheus aggregates on GET /metrics; optional CLAWQL_LOKI_PUSH_URL per-append Loki export; Grafana for metrics, logs, and (with OTLP) traces in Tempo.',
  path: '/learn/audit-tool-and-observability',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
