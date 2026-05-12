import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Concepts',
  description:
    'ClawQL architecture: MCP over stdio, Streamable HTTP, or optional MCP gRPC; in-memory search index, OpenAPI→GraphQL and optional native GraphQL/gRPC execute paths.',
  path: '/concepts',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
