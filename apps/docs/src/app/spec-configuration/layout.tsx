import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Spec configuration',
  description:
    'ClawQL spec configuration: CLAWQL_SPEC_PATH, merged bundles, OpenAPI and Discovery, bundled linear GraphQL SDL, optional CLAWQL_GRAPHQL_* and CLAWQL_GRPC_SOURCES for native protocols.',
  path: '/spec-configuration',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
