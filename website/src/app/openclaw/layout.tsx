import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'OpenClaw + ClawQL',
  description:
    'Full guide: install openclaw CLI, run clawql-mcp-http or stdio, openclaw mcp set JSON for url vs command, CLAWQL_* env, smoke tests, Tailscale and Helm, IDP skill profile link.',
  path: '/openclaw',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
