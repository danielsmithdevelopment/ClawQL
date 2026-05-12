import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'ClawQL Modularization',
  description:
    'ClawQL Modularization v2.0: intelligent MCP gateway, package ecosystem, operator CRD, defense-in-depth, and phased roadmap — vision with planned and in-progress work vs shipped code.',
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
