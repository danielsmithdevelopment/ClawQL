import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Authentication',
  description:
    'ClawQL inbound and outbound auth: proactive OAuth refresh with a mutex, API keys, EMA / ID-JAG (consumer and issuer), signing, and audit.',
  path: '/auth',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
