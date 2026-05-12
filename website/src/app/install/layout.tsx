import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Install',
  description:
    'Install clawql-mcp from npm: clawql-mcp and clawql-mcp-http binaries, npx, Docker image, offline bundled specs, and environment overview.',
  path: '/install',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
