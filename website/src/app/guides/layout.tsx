import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'Guides',
  description:
    'ClawQL guides: token efficiency, security, Learn modules, HITL, verticals, and hands-on MCP workflows beyond quickstart.',
  path: '/guides',
})

export default function GuidesLayout({ children }: { children: ReactNode }) {
  return children
}
