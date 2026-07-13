import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'ClawQL 7.0 setup guide',
  description:
    'Requirements and upgrade steps for clawql-mcp 7.0.0 — npm, Docker, Helm, and the optional operator.',
  path: '/getting-started/clawql-7-setup-guide',
})

export default function Clawql7SetupGuideLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
