import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'GraphQL layer',
  description:
    'ClawQL: OpenAPI-to-GraphQL in-process for lean execute; native GraphQL via CLAWQL_GRAPHQL_SOURCES; multi-spec OpenAPI uses REST.',
  path: '/graphql-proxy',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
