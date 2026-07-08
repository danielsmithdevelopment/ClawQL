import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Plugins',
  description:
    'ClawQL plugin documentation — core, memory, documents, automation, sandbox, Ouroboros, and more.',
  path: '/plugins',
})

import type { ReactNode } from 'react'

export default function PluginsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
