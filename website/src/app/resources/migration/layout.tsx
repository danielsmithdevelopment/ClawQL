import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'Migration guide',
  description:
    'Upgrade paths for ClawQL MCP server versions and teams migrating from ad-hoc MCP integrations.',
  path: '/resources/migration',
})

export default function MigrationGuideLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
