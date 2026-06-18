import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'ClawQL Modularization',
  description:
    'ClawQL Modularization v2.1: package boundaries, dependency graph, Kubernetes Operator, and intelligent MCP gateway design — authoritative reference for contributors.',
  path: '/vision/modularization',
  ogType: 'article',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
