import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'Changelog & releases',
  description:
    'ClawQL changelog and releases: GitHub tagged versions, npm clawql-mcp publishes, and documentation versioning on main.',
  path: '/resources/changelog',
})

export default function ChangelogLayout({ children }: { children: ReactNode }) {
  return children
}
