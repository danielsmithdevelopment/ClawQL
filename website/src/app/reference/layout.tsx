import { docsPageMetadata } from '@/lib/seo'

import type { ReactNode } from 'react'

export const metadata = docsPageMetadata({
  title: 'Reference',
  description:
    'ClawQL reference: MCP tools, configuration, protocol contracts, optional tools, plugins, and contributor technical specification.',
  path: '/reference',
})

export default function ReferenceLayout({ children }: { children: ReactNode }) {
  return children
}
