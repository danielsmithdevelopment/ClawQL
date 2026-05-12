import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Bundled specs',
  description:
    'ClawQL bundled specs: CLAWQL_PROVIDER presets (google, all-providers, Cloudflare, GitHub, Onyx, linear), offline OpenAPI, Google Discovery, and vendored Linear GraphQL SDL in the package.',
  path: '/bundled-specs',
})

import type { ReactNode } from 'react'

export default function DocsSegmentLayout({
  children,
}: {
  children: ReactNode
}) {
  return children
}
