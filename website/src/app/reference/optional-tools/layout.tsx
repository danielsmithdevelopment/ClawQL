import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'Optional MCP tools',
  description:
    'Optional ClawQL MCP tools beyond gateway core search, execute, audit, and cache — enable flags and Learn walkthrough links.',
  path: '/reference/optional-tools',
})

export default function OptionalToolsLayout({ children }: { children: ReactNode }) {
  return children
}
