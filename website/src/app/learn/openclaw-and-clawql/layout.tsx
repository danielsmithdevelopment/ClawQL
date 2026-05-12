import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'OpenClaw with ClawQL — gateway plus MCP APIs',
  description:
    'What OpenClaw is vs ClawQL MCP, why to combine them, install openclaw CLI, run clawql-mcp-http or stdio, openclaw mcp set, smoke tests, env and Tailscale, IDP skill profile.',
  path: '/learn/openclaw-and-clawql',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
