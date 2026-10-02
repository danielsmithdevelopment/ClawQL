import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Using ouroboros_* tools (seed, loop, lineage)',
  description:
    'Learn guide: ouroboros_create_seed_from_document, ouroboros_run_evolutionary_loop, ouroboros_get_lineage_status—how they work together, benefits, route hints, Postgres lineage, and a full MCP example.',
  path: '/learn/ouroboros-tools',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
