import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Troubleshooting',
  description:
    'ClawQL troubleshooting: MCP connection errors, GraphQL translation, search limits, large OpenAPI documents, Kubernetes port-forward and HTTP endpoints.',
  path: '/troubleshooting',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
