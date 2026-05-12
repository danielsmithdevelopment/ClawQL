import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Ouroboros library',
  description:
    'clawql-ouroboros: TypeScript evolutionary loop (Seed, Wonder/Reflect, Executor, Evaluator, convergence). Workspace package in ClawQL, embeddable as a library and optionally exposed as ouroboros_* tools on clawql-mcp.',
  path: '/ouroboros',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
