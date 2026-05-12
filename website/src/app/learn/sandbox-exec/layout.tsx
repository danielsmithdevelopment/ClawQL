import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Using sandbox_exec (Seatbelt, Docker, Cloudflare)',
  description:
    'Optional sandbox_exec MCP tool: macOS Seatbelt, Docker/Podman, and Cloudflare Workers bridge—how they differ, env wiring, auto-selection, and safe session patterns.',
  path: '/learn/sandbox-exec',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
